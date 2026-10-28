"""Sign-in security: lockout, password expiry, forced change, new-password rules, ending sessions — in-memory SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from unittest import TestCase

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.deps.auth import _check_password_change
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.company_module_setting import CompanyModuleSetting
from app.security import hash_password
from app.services.core import auth_security as sec

CO = "default"


class AuthSecurityTests(TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=[AuthUser.__table__, AuthSession.__table__, CompanyModuleSetting.__table__])
        self.db: Session = sessionmaker(bind=engine)()
        self.user = AuthUser(
            company_id=CO, email="a@x.test", username="a", name="A", password_hash=hash_password("secret123"),
            password_changed_at=datetime.utcnow(),
        )
        self.db.add(self.user)
        self.db.flush()

    def tearDown(self):
        self.db.close()

    def _settings(self, **values):
        self.db.add(CompanyModuleSetting(company_id=CO, module_id="security", values_json=json.dumps(values)))
        self.db.flush()

    def test_lock_after_five_wrong_passwords(self):
        for _ in range(4):
            self.assertFalse(sec.register_failed_login(self.db, self.user))
        sec.check_not_locked(self.user)  # four wrong is still allowed
        self.assertTrue(sec.register_failed_login(self.db, self.user))
        with self.assertRaises(HTTPException) as caught:
            sec.check_not_locked(self.user)
        self.assertEqual(caught.exception.status_code, 423)
        # the lock runs out on its own
        sec.check_not_locked(self.user, now=datetime.utcnow() + timedelta(minutes=16))

    def test_success_and_unlock_clear_the_count(self):
        sec.register_failed_login(self.db, self.user)
        sec.register_login(self.user)
        self.assertEqual(self.user.failed_login_count, 0)
        self.assertIsNotNone(self.user.last_login_at)
        self._settings(lockoutAttempts=2, lockoutMinutes=5)
        sec.register_failed_login(self.db, self.user)
        self.assertTrue(sec.register_failed_login(self.db, self.user))
        sec.unlock(self.user)
        sec.check_not_locked(self.user)

    def test_lockout_can_be_turned_off(self):
        self._settings(lockoutAttempts=0)
        for _ in range(30):
            self.assertFalse(sec.register_failed_login(self.db, self.user))

    def test_password_expiry(self):
        self.assertFalse(sec.password_change_due(self.db, self.user))  # off by default
        self._settings(passwordExpiryDays=30)
        self.assertFalse(sec.password_change_due(self.db, self.user))
        self.assertTrue(sec.password_change_due(self.db, self.user, now=datetime.utcnow() + timedelta(days=31)))

    def test_forced_change_blocks_everything_but_me_change_and_logout(self):
        self.user.must_change_password = True
        for path in ("/api/v1/auth/me", "/api/v1/auth/change-password", "/api/v1/auth/logout"):
            _check_password_change(self.db, self.user, path)
        with self.assertRaises(HTTPException) as caught:
            _check_password_change(self.db, self.user, "/api/v1/finance/vouchers")
        self.assertEqual(caught.exception.status_code, 403)
        self.user.must_change_password = False
        _check_password_change(self.db, self.user, "/api/v1/finance/vouchers")

    def test_new_password_rules(self):
        for bad in ("short1", "lettersonly", "12345678", "secret123"):
            with self.assertRaises(HTTPException):
                sec.check_new_password(self.user, bad)
        sec.check_new_password(self.user, "better2026")

    def test_revoke_keeps_the_current_session(self):
        future = datetime.utcnow() + timedelta(days=1)
        for token in ("t1", "t2", "t3"):
            self.db.add(AuthSession(user_id=self.user.id, token=token, expires_at=future, user_agent="Mozilla/5.0 (Windows NT 10.0) Chrome/120"))
        self.db.flush()
        self.assertEqual(sec.revoke_sessions(self.db, self.user.id, keep_token="t2"), 2)
        rows = sec.active_sessions(self.db, self.user.id)
        self.assertEqual([r.token for r in rows], ["t2"])
        self.assertEqual(sec.session_label(rows[0]), "Chrome on Windows")
