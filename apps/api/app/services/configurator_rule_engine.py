"""Server-side port of apps/web/src/lib/compatibility/rule-evaluator.ts.

The admin's compatibility-evaluator-panel already runs this logic client-side
against live data, so a rule an admin builds there behaves identically here —
same operators, same normalization, same "unknown data skips the rule rather
than failing it" behavior. This is what actually enforces compatibility
(create_build no longer hardcodes "compatible"), so it has to match, not just
resemble, the TS version.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, TypedDict

FIELD_ALIASES: Dict[str, List[str]] = {
    "socket": ["socket"],
    "ram_type": ["ram_type", "type"],
    "type": ["type", "ram_type"],
    "tdp": ["tdp"],
    "speed": ["speed"],
    "wattage": ["wattage"],
    "socket_support": ["socket_support", "socket"],
    "cores": ["cores", "core_count"],
    "core_count": ["core_count", "cores"],
}


class ComponentContext(TypedDict):
    componentProfileId: str
    attributes: Dict[str, Any]


class RuleResult(TypedDict):
    rule_id: str
    rule_name: str
    matched: bool
    status: str
    message: str
    branch: str


def _read_attribute(attributes: Dict[str, Any], field_code: str) -> Optional[Any]:
    for key in FIELD_ALIASES.get(field_code, [field_code]):
        val = attributes.get(key)
        if val is not None and str(val).strip() != "":
            return val
    return None


def _resolve_attribute_ref(ref: Dict[str, str], components: Sequence[ComponentContext]) -> Optional[Any]:
    comp = next((c for c in components if c["componentProfileId"] == ref["profileId"]), None)
    if not comp:
        return None
    return _read_attribute(comp["attributes"], ref["fieldCode"])


def _normalize_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _tokens(value: Any) -> List[str]:
    return [t for t in (_normalize_token(part) for part in re.split(r"[,|/]+", str(value))) if t]


def _resolve_operand(operand: Dict[str, Any], components: Sequence[ComponentContext]) -> Optional[Any]:
    if "literal" in operand:
        return operand["literal"]
    return _resolve_attribute_ref(operand, components)


def _compare(left: Any, operator: str, right: Any) -> bool:
    if left is None or right is None:
        return False
    if operator == "equals":
        return _normalize_token(left) == _normalize_token(right)
    if operator == "not_equals":
        return _normalize_token(left) != _normalize_token(right)
    if operator == "contains":
        return str(right).lower() in str(left).lower()
    if operator == "supports":
        left_tokens, right_tokens = _tokens(left), _tokens(right)
        if "universal" in left_tokens or "universal" in right_tokens:
            return True
        return any(t in left_tokens for t in right_tokens) or any(t in right_tokens for t in left_tokens)
    if operator == "overlap":
        # Stricter than "supports" — a real shared token required on both
        # sides, no "universal" bypass. Used for multi-value-vs-multi-value
        # fit checks (e.g. case's motherboard-support list vs the
        # motherboard's own form factor list).
        left_tokens, right_tokens = set(_tokens(left)), set(_tokens(right))
        return bool(left_tokens & right_tokens)
    if operator == "in":
        # Left value is one of the right side's list (select ∈ multi-select).
        right_tokens = set(_tokens(right))
        return any(t in right_tokens for t in _tokens(left))
    if operator == "not_in":
        right_tokens = set(_tokens(right))
        return not any(t in right_tokens for t in _tokens(left))
    if operator == "greater_than":
        try:
            return float(left) > float(right)
        except (TypeError, ValueError):
            return False
    if operator == "less_than":
        try:
            return float(left) < float(right)
        except (TypeError, ValueError):
            return False
    return False


def _find_all_components(profile_id: str, components: Sequence[ComponentContext]) -> List[ComponentContext]:
    return [c for c in components if c["componentProfileId"] == profile_id]


def _evaluate_aggregate_condition(
    condition: Dict[str, Any], components: Sequence[ComponentContext]
) -> Optional[bool]:
    """sum_lte / count_lte — aggregate across EVERY component sharing the
    left slot's profileId (a multi-pick slot, e.g. every selected RAM
    stick), not just the first match evaluate_condition would normally use.
    Skips (returns None) if the left slot has no picks yet or the right side
    can't be resolved — same "unknown data doesn't fail the rule" contract
    as every other operator."""
    operator = condition["operator"]
    left_ref = condition["left"]
    matches = _find_all_components(left_ref["profileId"], components)
    if not matches:
        return None
    right = _resolve_operand(condition["right"], components)
    if right is None:
        return None
    try:
        target = float(right)
    except (TypeError, ValueError):
        return False

    if operator == "count_lte":
        return len(matches) <= target

    total = 0.0
    any_value = False
    for comp in matches:
        val = _read_attribute(comp["attributes"], left_ref["fieldCode"])
        if val is None:
            continue
        try:
            total += float(val)
            any_value = True
        except (TypeError, ValueError):
            continue
    if not any_value:
        return None
    return total <= target


# Fields summed for a whole-build power-budget check, in priority order per
# component (first one present wins) — mirrors the artifact's own
# `val(p,"cpu_tdp") ?? val(p,"gpu_tdp")`.
_POWER_FIELDS = ("tdp", "gpu_tdp")


def _evaluate_power_condition(
    condition: Dict[str, Any], components: Sequence[ComponentContext]
) -> Optional[bool]:
    """power — sum every component's TDP-like field + a base wattage,
    times (1 + margin%), compared against the right side (normally the
    selected PSU's wattage). left.profileId is ignored (conventionally
    "all"); this always sums the WHOLE current selection."""
    right = _resolve_operand(condition["right"], components)
    if right is None:
        return None
    try:
        target = float(right)
    except (TypeError, ValueError):
        return False

    base = float(condition.get("base") or 0)
    margin = float(condition.get("margin") or 0)
    total = base
    for comp in components:
        for field in _POWER_FIELDS:
            val = comp["attributes"].get(field)
            if val is None:
                continue
            try:
                total += float(val)
            except (TypeError, ValueError):
                pass
            break
    need = total * (1 + margin / 100)
    return need <= target


def _evaluate_requires_condition(
    condition: Dict[str, Any], components: Sequence[ComponentContext]
) -> Optional[bool]:
    """requires (⇒) — if the left field equals condition["value"], the right
    slot must have something selected. Skips if the left slot itself has no
    pick yet (nothing to trigger the implication); if the left value simply
    doesn't match, the implication is vacuously true (skip is wrong there —
    the rule genuinely passes, matching the artifact's own `res("pass",
    "প্রযোজ্য নয়")` for a non-triggering requires)."""
    left = _resolve_attribute_ref(condition["left"], components)
    if left is None:
        return None
    if _normalize_token(left) != _normalize_token(condition.get("value", "")):
        return True
    right_matches = _find_all_components(condition["right"]["profileId"], components)
    return len(right_matches) > 0


def evaluate_condition(condition: Dict[str, Any], components: Sequence[ComponentContext]) -> Optional[bool]:
    operator = condition["operator"]
    if operator in ("sum_lte", "count_lte"):
        return _evaluate_aggregate_condition(condition, components)
    if operator == "power":
        return _evaluate_power_condition(condition, components)
    if operator == "requires":
        return _evaluate_requires_condition(condition, components)
    left = _resolve_attribute_ref(condition["left"], components)
    right = _resolve_operand(condition["right"], components)
    if left is None or right is None:
        return None
    if operator in ("lte", "gte"):
        # Numeric ≤ / ≥ with an optional safety margin %: lte checks left×(1+m) ≤ right,
        # gte checks left ≥ right×(1+m).
        try:
            l_val, r_val = float(left), float(right)
        except (TypeError, ValueError):
            return False
        k = 1 + float(condition.get("margin") or 0) / 100
        return l_val * k <= r_val if operator == "lte" else l_val >= r_val * k
    return _compare(left, operator, right)


def _when_ok(when: Optional[Dict[str, Any]], components: Sequence[ComponentContext]) -> Optional[bool]:
    """Optional conditional-when clause on a rule: only evaluate the rule's
    conditions when some OTHER field elsewhere in the build matches a value
    (e.g. the radiator-size rule only applies when cooler type = AIO).
    None (not just False) when the referenced slot isn't picked yet, so the
    whole rule correctly skips rather than reporting pass/fail on a
    not-yet-applicable build."""
    if not when:
        return True
    value = _resolve_attribute_ref({"profileId": when["profileId"], "fieldCode": when["fieldCode"]}, components)
    if value is None:
        return None
    return _normalize_token(value) == _normalize_token(when.get("value", ""))


def evaluate_rule_body(body: Dict[str, Any], components: Sequence[ComponentContext]) -> Dict[str, Any]:
    when_result = _when_ok(body.get("when"), components)
    if when_result is None:
        return {"matched": False, "skipped": True, "outcome": {"status": "compatible", "message": ""}, "branch": "then"}
    if when_result is False:
        return {"matched": False, "skipped": True, "outcome": {"status": "compatible", "message": ""}, "branch": "then"}
    checks = [evaluate_condition(c, components) for c in body.get("conditions", [])]
    if any(v is None for v in checks):
        return {"matched": False, "skipped": True, "outcome": {"status": "compatible", "message": ""}, "branch": "then"}
    matched = len(checks) == 0 or all(checks)
    if matched:
        return {"matched": True, "skipped": False, "outcome": body["then"], "branch": "then"}
    return {"matched": False, "skipped": False, "outcome": body["else"], "branch": "else"}


def _slot_condition_ok(condition: Dict[str, Any], attributes: Dict[str, Any]) -> bool:
    """One slot-membership condition: {f: field_code, op: has|eq|neq|in, v:
    optional value} against a product's own resolved attributes — simpler
    than a rule condition (always product-vs-literal, never product-vs-
    product), mirrors the reference artifact's condOk()."""
    field = condition.get("f")
    raw = attributes.get(field) if field else None
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        values: List[str] = []
    elif isinstance(raw, list):
        values = [str(v) for v in raw]
    else:
        values = [t for t in re.split(r"[,|/]+", str(raw)) if t.strip()] or [str(raw)]
    values = [v.strip() for v in values if v.strip()]

    op = condition.get("op", "has")
    if op == "has":
        return len(values) > 0
    target = str(condition.get("v", ""))
    if op == "eq":
        return target in values
    if op == "neq":
        return len(values) > 0 and target not in values
    if op == "in":
        candidates = [x.strip() for x in target.split(",") if x.strip()]
        return any(v in candidates for v in values)
    return False


def evaluate_slot_conditions(conditions: Sequence[Dict[str, Any]], attributes: Dict[str, Any]) -> bool:
    """AND-chain of slot-membership conditions — a product must satisfy all
    of them (or the list is empty, which always passes) to belong to the slot."""
    return all(_slot_condition_ok(c, attributes) for c in conditions)


def merge_statuses(statuses: Sequence[str]) -> str:
    if "incompatible" in statuses:
        return "incompatible"
    if "warning" in statuses:
        return "warning"
    return "compatible"


def evaluate_rules(
    rules: Sequence[Dict[str, Any]],
    components: Sequence[ComponentContext],
) -> Dict[str, Any]:
    """rules: rows shaped like {id, name, active, priority, body} — same as the
    /configurator/profiles/{slug}/rules payload, already filtered to the
    active rows for this profile and sorted by priority by the caller."""
    results: List[RuleResult] = []
    for rule in rules:
        outcome = evaluate_rule_body(rule["body"], components)
        if outcome["skipped"]:
            continue
        results.append(
            RuleResult(
                rule_id=rule["id"],
                rule_name=rule["name"],
                matched=outcome["matched"],
                status=outcome["outcome"]["status"],
                message=outcome["outcome"]["message"],
                branch=outcome["branch"],
            )
        )
    status = merge_statuses([r["status"] for r in results])
    return {"status": status, "results": results}
