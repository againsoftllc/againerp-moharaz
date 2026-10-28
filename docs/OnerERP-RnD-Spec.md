# Oner ERP Suite — R&D Spec (againERP-তে implement করার রেফারেন্স)

> **উৎস:** MUNSHIGANJ IT-এর লাইভ Oner ERP Suite (Release 26.06.20.01), ইউজার Moshiur (Level: Administration, Role: Administrator), Head Office লোকেশন।
> **তারিখ:** ২৭–২৮ অক্টোবর ২০২৬।
> **পদ্ধতি:** শুধু দেখা আর পড়া হয়েছে: মেনু, ফর্ম, ফর্মের client-side লজিক, lookup API (GET), আর গোনা সংখ্যা। কোনো এন্ট্রি Save, Approve, Cancel বা Delete করা হয়নি।
> **সীমা:** যেসব মডিউল এই কোম্পানির লাইসেন্স বা permission-এ বন্ধ (Production, HR task, POS, PO/GRN ইত্যাদি), সেগুলোর ভেতরের কোড ইচ্ছাকৃতভাবে বিশ্লেষণ করা হয়নি। এগুলোর বর্ণনা শুধু মেনুর নাম আর রিপোর্টের নাম থেকে।
> **নীতি:** এখানে Oner-এর কোড কপি করা হয়নি। ফিচার, workflow আর ডেটার কাঠামো নিজের ভাষায় লেখা, যাতে againERP নিজস্ব ডিজাইনে বানানো যায়।

---

## 0. এই ডকুমেন্ট কীভাবে ব্যবহার করবেন

Claude-কে কাজ দেওয়ার সময় সেকশন নম্বর ধরে বলুন। যেমন:

- "OnerERP-RnD-Spec.md-এর **§3** অনুযায়ী againERP-তে Role + User + Location permission সিস্টেম বানাও।"
- "**§11** (Cheque) দেখে Cheque Book Register আর Cheque Treatment মডিউল implement করো।"
- "**§8.2**-এর Sales Order ডেটা মডেল দেখে আমাদের `sales_orders` আর `sales_order_items` টেবিলের migration লেখো।"
- "**§5**-এর feature flag প্যাটার্ন দিয়ে কোম্পানি-স্তরের settings টেবিল বানাও।"
- "**§14** roadmap-এর Phase 1 শুরু করো।"
- "**§15** অনুযায়ী Customer আর Supplier ledger, Outstanding, Aging আর Settlement বানাও।"
- "**§16** দেখে againERP-র Chart of Accounts, ভাউচার, auto-posting rules আর financial statements বানাও।"
- "**§17.6**-এর gap list ধরে againERP-র approval সিস্টেম উন্নত করো।"
- "**§18** অনুযায়ী serial/non-serial প্রোডাক্টের এন্ট্রি, বাছাই আর ইতিহাস (serial ledger) বানাও।"
- "**§19** দেখে বলো againERP-তে কোনটা বানানো হয়ে গেছে আর কোনটা বাকি।" (Finance: §19.1–19.2, User Access: §19.3)

প্রতিটা সেকশনে চিহ্ন দেওয়া আছে:

- **[দেখা]**: সরাসরি পর্যবেক্ষণ করা তথ্য।
- **[অনুমান]**: যুক্তি দিয়ে বের করা তথ্য। implement করার আগে যাচাই করে নিন।
- **[againERP]**: আমাদের সিস্টেমের জন্য পরামর্শ।

---

## 1. সিস্টেম সারসংক্ষেপ

| বিষয় | তথ্য |
|---|---|
| পণ্য | Oner ERP Suite, Oner Systems Ltd. ("14 Core Modules", multi-company, multi-location) |
| গ্রাহক কোম্পানি | MUNSHIGANJ IT (গ্যাজেট বা ইলেকট্রনিক্স ট্রেডিং) |
| লোকেশন | Head Office, Gadget Waki (শোরুম), WIREHOUSE (গুদাম) |
| মেনু কোড | মোট ৫১৬টা (M0003…M05xx)। কোম্পানির জন্য চালু ~৩৭১টা, Moshiur-এর জন্য ২৩০টা। |
| ইউজার | ~১৭ জন, ৫টা Level, ৯টা Role |
| মূল শক্তি | Serial বা IMEI ট্র্যাকিং, Warranty/RMA, Cheque ম্যানেজমেন্ট, auto-accounting, approval workflow, feature flag |

### 1.1 মেনুর গঠন (top level)

```
Dashboard
Setup        (~113 পেজ)  ← মাস্টার ডেটা
Task         (~95)       ← লেনদেন এন্ট্রি
Edit         (~44)       ← Before / After Approval সংশোধন
Approve      (~56)
Cancel       (~57)
Reports      (~131)
Data Import  (5)
Others       (Bulk SMS, Error Log)
Security     (9)
Advance Search (Serial, Product)
```

**মূল ডিজাইন প্যাটার্ন:** একই মডিউল (Sales, Purchase ইত্যাদি) Task, Edit, Approve, Cancel আর Reports, এই পাঁচ জায়গায় আলাদা পেজ হিসেবে আসে। তাই permission-ও আলাদা দেওয়া যায়। যেমন একজন এন্ট্রি দিতে পারে কিন্তু approve করতে পারে না। **[দেখা]**

---

## 2. টেকনিক্যাল আর্কিটেকচার [দেখা]

| স্তর | বিবরণ |
|---|---|
| Web app | ASP.NET MVC (server-rendered পেজ) + AngularJS 1.6.5, পোর্ট `7547` |
| API | আলাদা Web API সার্ভার, পোর্ট `7548` (`serviceBasePath`) |
| Auth | OAuth2 **password grant**: `POST /token` (username, password, companyId, locationId, grant_type=password) → `{access_token, token_type, expires_in}` |
| Token রাখা | ব্রাউজারের `localStorage.user`। প্রতিটা API কলে `Authorization: Bearer …` |
| পেজ নেভিগেশন | প্রতিটা মেনু লিংকে `?token=<access_token>` থাকে। সার্ভার পেজ রেন্ডারের সময় permission চেক করে, অনুমতি না থাকলে "Access Restricted" পেজ দেয়। |
| লগইনের পর | `GET /api/S0003` থেকে আসে CompanyCode/Name, LocationId/Name, UserName, DefaultCurrency, UserLevel, UserRole, IsAllowMobileAppAccess আর **MenuAccess** map। এগুলো `localStorage.loggedInfo`-তে রাখা হয়। |
| লাইসেন্স | লগইনের পরে `GET /api/SoftExpChk` চলে। মেয়াদ শেষ হলে `/LicenseNotification/LicenseExpired` পেজে পাঠায়। |
| Idempotency | প্রতিটা POST/PUT/PATCH/DELETE-এ `X-Idempotency-Key` (UUID) যায়। নেটওয়ার্ক বা 5xx error হলে একই key দিয়ে ৩ বার পর্যন্ত আবার চেষ্টা করে, তাই এন্ট্রি দুবার হয় না। |
| Error | 401 হলে reject। 403 হলে "You have no permission."। |
| UI লাইব্রেরি | ngConfirm (alert), angular-loading-bar, textAngular (rich text), ngFileUpload |
| Pagination | ডিফল্ট ১০ সারি (`dataTableRows`), সার্ভার-সাইড paging (`pageIndex`, `pageSize`) |

### 2.1 API নামকরণ [অনুমান]
API-র নাম সাংকেতিক। প্যাটার্ন দেখে যা মনে হয়:

| Prefix | অর্থ | উদাহরণ |
|---|---|---|
| `S0xxx` | Setup বা System lookup (GET) | S0001 কোম্পানি, S0002 লোকেশন, S0003 logged info, S0085/S0086 permission fetch |
| `SEC0x` | Security write | SEC04 location permission save, SEC05 menu permission save |
| `C00xxx` | Common lookup (ড্রপডাউন) | C00205 cheque status by group |
| `TS0xxx` | Task Select (লিস্ট বা ডিটেইল GET) | TS00203 cheque list, TS0004 voucher detail, TS0130 payment detail |
| `TI0xxx` | Task Insert (POST save) | TI00204 cheque treatment save |
| `TE0xx` | Task Execute (approve/cancel) | TE025 payment cancel `{id, reason}`, TE026 payment approve |

**[againERP]** সাংকেতিক নামের বদলে REST-ধাঁচের অর্থবোধক নাম রাখুন, যেমন `POST /api/payments/{id}/approve`। তবে Insert, Select আর Execute আলাদা রাখার ধারণাটা ভালো।

### 2.2 নিরাপত্তা দুর্বলতা যা againERP-তে এড়াতে হবে [দেখা]
1. **টোকেন URL-এ যায়** (`?token=`)। এটা ব্রাউজারের history, সার্ভার লগ আর Referer header-এ থেকে যায়।
2. **HTTP চলে, HTTPS নয়।** Chrome "Not secure" দেখায়।
3. **টোকেন `localStorage`-এ।** কোনো XSS হলে চুরি হতে পারে।
4. **লাইসেন্স না থাকা মডিউলের static JS ফাইলও যে কেউ ডাউনলোড করতে পারে।** ডেটা বের হয় না, কিন্তু কোড উন্মুক্ত থাকে।
5. লগইন ফর্মে অবশ্য ভালো একটা অভ্যাস আছে: পেজ লোড হলেই `localStorage.clear()` চলে।

**[againERP]** HTTPS, httpOnly + Secure cookie (বা শুধু header-এ token, URL-এ কখনো নয়), প্রতিটা API endpoint-এ সার্ভার-সাইড permission চেক, আর static asset-এর জন্য লাইসেন্স অনুযায়ী bundle।

---

## 3. User Access / Security — বিস্তারিত [দেখা]

Oner-এর access নিয়ন্ত্রণ **৭টা স্তরে** চলে। একটা ইউজার কোনো পেজ বা কাজ তখনই করতে পারে, যখন সব স্তর অনুমতি দেয়।

```
L0 License (Software Expiry)            ← পুরো সফটওয়্যার চলবে কিনা
 └─ L1 Company Menu Permission          ← কোম্পানি কোন মডিউল বা মেনু কিনেছে বা পাবে
     └─ L1b Company Report List Permission
         └─ L2 Level + Role Menu Permission   ← Role অনুযায়ী মেনু
             └─ L3 User-wise Menu Permission  ← নির্দিষ্ট ইউজারের override
L4 Location Access (Login / Report / Operational)   ← কোন লোকেশনে কী করতে পারবে
L5 Accounts Permission (Location বা User অনুযায়ী)     ← কোন অ্যাকাউন্ট হেড দেখবে বা ব্যবহার করবে
L6 Software Access Time (লোকেশন × দিন × সময় × ইউজার) ← কখন লগইন করা যাবে
+ Feature flags: CheckPassword (approve-এ পাসওয়ার্ড), EntryByApproveCancel …
```

> **againERP-তে অবস্থা:** L0, L1, L2, L3, L5, পাসওয়ার্ডের নিয়ম আর লগইন লক বানানো হয়েছে, L4 আংশিক, L6 বাকি। দেখুন §19.3।

### 3.1 Security User (Security › User)
| ফিল্ড | অর্থ |
|---|---|
| UserLevel | Level (যেমন Administration, Accounts, Manager, Operator, Support) |
| UserRole | Role (Administrator, Accounts, CEO, Manager, Sales Admin, Service Support Admin, Social Media, Training Purposes) |
| UserName, UserFullName, UserEmail | পরিচয় |
| Password / Confirm | পাসওয়ার্ড |
| IsActive | সক্রিয় কিনা |
| PasswordResetDays | কত দিন পরপর পাসওয়ার্ড বদলাতে বাধ্য করবে |
| IsResetPassword | পরের লগইনে পাসওয়ার্ড বদলাতে হবে |
| AllowMobileAppAccess | মোবাইল অ্যাপে লগইন করা যাবে কিনা |
| AssignTo + AssignToId | ইউজারটা কোন **Employee** (E) বা **Customer** (C)-এর সাথে যুক্ত। শুধু এখনো যুক্ত হয়নি এমন Employee বা Customer দেখায়। |

এর পাশাপাশি **Change Password** পেজ আছে: CurrentPassword, NewPassword, ConfirmPassword।

**Level আর Role দুটো আলাদা মাত্রা।** Level দিয়ে সাংগঠনিক স্তর বোঝায়, Role দিয়ে কাজের ধরন। একই Role (যেমন Manager) ভিন্ন Level-এ থাকতে পারে, এবং permission সংরক্ষিত হয় **Level + Role জোড়া** অনুযায়ী। User Level মাস্টারে Code, Name আর **CompanyList** থাকে, অর্থাৎ কোন Level কোন কোম্পানিতে প্রযোজ্য।

বর্তমান বণ্টন (শুধু সংখ্যা):

| Level + Role | ইউজার | চালু মেনু (৩৭১-এর মধ্যে) |
|---|---|---|
| Administration + Administrator | 2 | 243 |
| Operator + Sales Admin | 11 | 135 |
| Administration + Sales Admin | 0 | 103 |
| Support + Service Support Admin | 0 | 4 |
| Accounts + Accounts | 1 | 0 (user-wise permission থাকতে পারে) |
| Administration + Manager | 1 | 0 (user-wise) |
| Operator + Manager | 1 | 0 (user-wise) |
| Operator + Service Support Admin | 1 | 0 (user-wise) |

### 3.2 Menu Permission (Security › Menu Permission)
- দুই মোড: **Role Wise** (Level + Role বাছাই) আর **User Wise** (Level, Role, তারপর User)। User-wise permission role-wise-কে override করে। উদাহরণ: একজন admin ইউজারের ২৪২টা, অথচ তার role-এ ২৪৩টা।
- Role ড্রপডাউনে "Administrator" আসে না (`FetchSecurityRoleWithoutAdministrator`)। Administrator role-এর permission এখান থেকে বদলানো যায় না।
- **মেনু tree**: ৩ স্তর (Group → Sub-group → Page), মোট ~৪৪৬টা node। শুধু কোম্পানির জন্য চালু মেনুগুলো আসে।
  - প্রতিটা node-এ থাকে: `id`, `name`, `isChecked`, `hasCode`, `code` (যেমন "M0017"), `children[]`, `othersReportList[]`।
  - `othersReportList`: একটা মেনুর অধীনে আলাদা আলাদা রিপোর্টের permission (popup-এ দেখায়)।
  - UI-তে আছে "Select All", ক্যাটাগরি অনুযায়ী সব বাছাই, আর রিপোর্ট popup-এ সব বাছাই।
- Save করলে পাঠানো হয় `{PermissionFor, LevelId, RoleId, UserId, MenuLists(পুরো tree)}`।

### 3.3 MenuAccess map (runtime enforcement)
লগইনের পরে সার্ভার একটা map পাঠায়:
```json
{
  "SetupList": {
    "HasCheckedLevel2Menu": true,          // Setup মেনু দেখাবে কিনা
    "HasCheckedLevel3Accounts": true,      // Setup > Accounts সাবমেনু দেখাবে কিনা
    "M0017": true, "M0018": true, ...      // প্রতিটা পেজ
  },
  "TaskList": {...}, "EditList": {...}, "ApproveList": {...}, "CancelList": {...},
  "ReportList": {...}, "DataImportList": {...}, "SecurityList": {...},
  "AdvanceSearchList": {...}, "OthersList": {...}, "DashboardList": {...}
}
```
- সাইডবারের প্রতিটা `<li>`-তে `ng-if="MenuAccess.SetupList.M0017"` ধাঁচের শর্ত থাকে, তাই অনুমতি না থাকলে মেনু দেখায় না।
- এর সাথে সার্ভারও পেজ রেন্ডারের সময় আলাদাভাবে চেক করে ("Access Restricted")। ফলে UI আর সার্ভার, দুই স্তরেই নিয়ন্ত্রণ থাকে।

**[againERP]** একই প্যাটার্ন রাখুন: স্থায়ী `menu_code` ধরে permission। লগইনের পরে কম্প্যাক্ট permission map পাঠান। UI শুধু দেখানো বা লুকানোর জন্য, আসল নিয়ন্ত্রণ সার্ভারে।

### 3.4 Location Access Permission (Security › Location Permission)
প্রতিটা ইউজারের জন্য, প্রতিটা কোম্পানির প্রতিটা লোকেশনে তিনটা আলাদা অনুমতি:

| ফ্ল্যাগ | অর্থ |
|---|---|
| `IsLoginAccess` | এই লোকেশন বেছে লগইন করতে পারবে |
| `IsReportAccess` | এই লোকেশনের রিপোর্ট দেখতে পারবে (রিপোর্টের লোকেশন ড্রপডাউন এটা থেকে আসে: `FetchLocationForReportAccessByAssignedLocation`) |
| `IsOperationalAccess` | এই লোকেশনের জন্য লেনদেন করতে পারবে |

- Save করলে পাঠানো হয় `{UserId, LoginLocationLists}`।
- Feature flag `UserWiseLocationRestriction` এখন বন্ধ।
- বর্তমানে: ১০ জন ইউজারেরই Head Office-এ লগইন অনুমতি আছে, ৫ জনের Gadget Waki আর WIREHOUSE-এও। Report আর Operational ফ্ল্যাগ কারো চালু নেই (feature বন্ধ থাকায় সম্ভবত ব্যবহার হয় না)।

### 3.5 Accounts Permission (Security › Accounts Permission) — এই ইউজারের জন্য বন্ধ, গঠন JS থেকে
- `PermissionFor`: `L` (লোকেশন অনুযায়ী) অথবা `U` (ইউজার অনুযায়ী)।
- `{PermissionFor, LocationId, LevelId, RoleId, UserId, AccountsLists(tree, isChecked)}`।
- উদ্দেশ্য: কোন অ্যাকাউন্ট হেড (যেমন কোন Cash বা Bank) কোন লোকেশন বা ইউজার ভাউচারে ব্যবহার বা দেখতে পারবে।

### 3.6 Company Menu Permission আর Company Report List Permission
- `{CompanyId, MenuLists(tree)}`: কোম্পানি-স্তরে কোন মেনু বা রিপোর্ট চালু। এর উপরেই Role permission কাজ করে।
- Multi-company সেটআপে প্রতিটা child company-কে আলাদা মডিউল দেওয়া যায়। আর এটা vendor-এর লাইসেন্স অনুযায়ী মডিউল বিক্রির একটা কৌশলও।

### 3.7 Software Access Time (বন্ধ, গঠন JS থেকে)
- লোকেশন অনুযায়ী: `TimeFrom`, `TimeTo` (`DateTimeFrom`/`DateTimeTo`), `DaysOfWeekLists` (কোন কোন দিন), `UserLists` (কোন কোন ইউজার), আর `AllLoggedUser` / `AllDaysOfWeek` শর্টকাট।
- উদ্দেশ্য: অফিসের সময়ের বাইরে বা ছুটির দিনে লগইন বন্ধ রাখা।

### 3.8 লেনদেন-স্তরের নিরাপত্তা
- **Approve-এ পাসওয়ার্ড**: feature `CheckPassword` চালু থাকলে Approve করার আগে পাসওয়ার্ডের popup আসে (এখন বন্ধ)।
- **EntryByApproveCancel** = true: যে এন্ট্রি দিয়েছে, সে নিজেই approve বা cancel করতে পারবে কিনা। [অনুমান: true মানে পারবে]
- **Sales Order Settlement**-এ পাসওয়ার্ড লাগে (`securityUserPassword`)।
- **OperationDateEnable** = true, **OperationDateEnableForAdmin** = false: ইউজার লেনদেনের তারিখ বদলাতে পারবে কিনা (back-date নিয়ন্ত্রণ)।
- Cancel করতে সবসময় **Reason** দিতে হয় (`{id, reason}`)।

### 3.9 [againERP] প্রস্তাবিত টেবিল ডিজাইন
```
companies(id, code, name, ...)
locations(id, company_id, name, address, is_active)
warehouses(id, location_id, name)

security_levels(id, code, name)
security_level_companies(level_id, company_id)
security_roles(id, name, is_system_admin)
users(id, username, full_name, email, password_hash, level_id, role_id,
      is_active, password_reset_days, must_reset_password, allow_mobile_app,
      linked_type ENUM('employee','customer') NULL, linked_id NULL,
      password_changed_at, last_login_at)

menus(id, parent_id, code UNIQUE, name, level TINYINT, route, sort_order)
menu_reports(id, menu_id, code, name)              -- othersReportList
company_menus(company_id, menu_id)                  -- L1
company_menu_reports(company_id, menu_report_id)   -- L1b
role_menu_permissions(level_id, role_id, menu_id)  -- L2
role_menu_report_permissions(level_id, role_id, menu_report_id)
user_menu_permissions(user_id, menu_id, allow BOOLEAN)   -- L3 override
user_locations(user_id, location_id, can_login, can_report, can_operate)  -- L4
account_permissions(scope ENUM('location','user'), scope_id, account_id)  -- L5
access_time_rules(id, location_id, time_from, time_to)
access_time_rule_days(rule_id, day_of_week)
access_time_rule_users(rule_id, user_id)   -- ফাঁকা থাকলে সব ইউজার
company_features(company_id, feature_key, value_json)   -- §5
audit_logs(id, user_id, action, entity, entity_id, payload_json, ip, created_at)
```
**কার্যকর permission = company_menus ∩ (user override থাকলে user_menu, না থাকলে role_menu)**, সাথে location, অ্যাকাউন্ট আর সময়ের চেক।

---

## 4. সংগঠনের কাঠামো [দেখা]
```
Company (multi-company, child company সম্ভব)
 └─ Location (লগইনের সময় বাছাই করতে হয়, ভিন্ন ঠিকানা বা লোগো)
     └─ Warehouse (স্টক এখানে থাকে)
         └─ Stock Type: Current | RMA | Bad | WIP
```
- লগইনে Company (একটা থাকলে নিজে থেকে বাছাই হয়) আর Location বাছাই করতে হয়।
- রিপোর্ট লোকেশন অনুযায়ী ছাঁকা যায়। Accounts-এ `LocationWiseAccountsBalance` flag (এখন বন্ধ) আছে, আর Accounts-এ `LocationWiseOpeningLists` (লোকেশন অনুযায়ী opening balance) আছে।

---

## 5. Feature Flags (কোম্পানি-স্তরের সেটিং) [দেখা]

Oner-এ **৫৪টা feature flag** আছে। প্রতিটা ফর্ম লোড হওয়ার সময় সংশ্লিষ্ট flag পড়ে নেয় আর সেই অনুযায়ী আচরণ বদলায়। কিছু flag-এর ভেতরে sub-feature-ও আছে। **[againERP] এই প্যাটার্নটা অবশ্যই নিন।** একই কোডবেস বিভিন্ন ধরনের ব্যবসায় চালানো যায়।

| Flag | এখনকার মান | অর্থ |
|---|---|---|
| GovtDuty | true | VAT বা ডিউটি সিস্টেম চালু |
| GovtDutySub.ProductWiseDuty / LocationWiseDuty | false / true | ডিউটির রেট কোথা থেকে আসবে |
| IncludingGovtDutyForSales / ForPurchase | false / false | দামের মধ্যে ডিউটি ধরা আছে কিনা |
| GovtDutyChangeInQuotation / SalesOrder / Purchase | true / true / false | ফর্মে ডিউটি বদলানো যাবে কিনা |
| CheckPassword | false | Approve-এ পাসওয়ার্ড |
| EntryByApproveCancel | true | এন্ট্রিকারী নিজে approve বা cancel করতে পারে কিনা |
| OperationDateEnable / ForAdmin | true / false | তারিখ বদলানোর অনুমতি |
| SalesDiscountChangeAllow | true | বিক্রিতে ডিসকাউন্ট বদলানো যাবে |
| ZeroCostProductPurchase | false | ০ দামে কেনা যাবে না |
| ZeroPriceProductSales | true | ০ দামে বেচা যাবে (ফ্রি বা গিফট) |
| AvailableCurrentStockProduct | false | শুধু স্টকে থাকা প্রোডাক্ট দেখাবে কিনা |
| StockTypeSelectionInSales | false | বিক্রিতে Current, Bad বা RMA স্টক বাছাই করা যাবে কিনা |
| LocationWiseAccountsBalance | false | লোকেশন অনুযায়ী অ্যাকাউন্ট ব্যালেন্স |
| TradePromotion | true | Trade Offer বা Package |
| BlockSalesWhenCrossMinStockQty / CheckMinStockQtyAtSales | false / false | Min stock পার হলে বিক্রি আটকাবে বা সতর্ক করবে |
| BlockSalesWhenProductPriceLowerThanCost | false | খরচের চেয়ে কম দামে বিক্রি আটকাবে |
| RelieverMandatoryInLeaveApplication | false | ছুটির আবেদনে বদলি কর্মী বাধ্যতামূলক |
| ShowStockInfoAtSales | true | বিক্রির ফর্মে স্টক দেখাবে |
| ManageGeoLocation / ManageDistributionLocation | false / false | কাস্টমারে Geo বা Distribution hierarchy |
| MaintainChequeManagementFromVoucher | true | ভাউচার থেকে চেক ইস্যু বা গ্রহণ |
| MaintainChequeBookRegister | true | চেকের পাতা register থেকে বাছাই বাধ্যতামূলক |
| Funding (+ProductWise / SalesWise) | true (false, false) | Funding হিসাব |
| Commission (+ProductWise / SalesWise) | false | বিক্রয় কমিশন |
| PurchaseHistoryInPurchase / SalesHistoryInSales | true / true | শেষ ৩টা দাম দেখাবে |
| ShowPreviousDueInCollection / InSalesInvoice | false / false | আগের বকেয়া দেখাবে |
| ProductDiscountPercentInInvoice | false | ইনভয়েসে % ডিসকাউন্ট |
| ShowInvoiceDiscountInInvoiceFromOrder | false | |
| AllowAutoPurchaseForNegativeSales | false | স্টক ঋণাত্মক হলে নিজে থেকে purchase |
| AllowSalesOrderWithoutCheckingAvailableStock | true | স্টক না দেখেই অর্ডার নেওয়া যাবে |
| ProductPriceChangeAtGoodsReceive | false | GRN-এ দাম বদলানো যাবে |
| AllowSecondarySales | false | ডিস্ট্রিবিউটর থেকে রিটেইলার বিক্রি |
| CustomerSetupInSales | false | বিক্রির ফর্ম থেকেই নতুন কাস্টমার |
| ProductWiseAdditionalDiscountInSales | false | |
| InstallmentSales | false | কিস্তিতে বিক্রি |
| SecondaryUnitTypeAsDefault | false | ডিফল্ট ইউনিট |
| ShowAccountsCode | false | অ্যাকাউন্ট কোড দেখাবে |
| MaintainSalesAmountRounding | false | রাউন্ডিং |
| ProductWiseUpperLowerPriceSetup | false | প্রোডাক্ট অনুযায়ী দামের সীমা |
| UserWiseLocationRestriction | false | §3.4 |
| ShowConfigurationWisePriceAndDiscountLimitInSales | true | Configured price বা discount-এর সীমা দেখাবে |
| SalesPriceChangeInPOS | false | POS-এ দাম বদলানো |
| AllowExportFromSales | false | রপ্তানি বিক্রি |
| AllowCustomerWiseProductIdentificationCode | false | কাস্টমার অনুযায়ী প্রোডাক্ট কোড |
| AllowProductWiseAccountsHeadMapping | false | প্রোডাক্ট অনুযায়ী আলাদা Sales/Purchase হেড (§8.1) |

**[againERP]** টেবিল: `company_features(company_id, key, value_json)`। লগইনের পরে একবারে সব flag পাঠান (Oner প্রতিটা flag-এর জন্য আলাদা API কল করে, যেটা ধীর)।

---

## 6. ডকুমেন্টের জীবনচক্র (সব লেনদেনে একই নিয়ম) [দেখা]

```
            ┌─────────── Edit (Before Approval) ───────────┐
            ▼                                              │
[Task: Entry] ──Save──► Pending ──Approve (single/bulk)──► Approved ──► পরের ধাপের ডকুমেন্টে আসে
                          │      (CheckPassword হলে            │        (Order→Challan→Invoice)
                          │       পাসওয়ার্ড)                    ├── Edit (After Approval) [কিছু ডকুমেন্টে]
                          │                                    ├── Settlement (বাকি qty বন্ধ, Reason, কখনো পাসওয়ার্ড)
                          └──Cancel(Reason)──► Cancelled ◄─────┴── Cancel (After Approval) [কিছু ডকুমেন্টে]
```
- প্রতিটা Task ফর্মে থাকে: New, Save, Update (edit mode), Print, আর নিচে আগের এন্ট্রির তালিকা (paging সহ, তারিখের রেঞ্জ আর লোকেশন অনুযায়ী ছাঁকা)।
- এন্ট্রির নম্বর সার্ভার তৈরি করে, Save-এর জবাবে `{IsSuccess, Message}` আসে, যেখানে Message-এ নতুন নম্বর থাকে।
- Approve পেজ: pending তালিকা, ডিটেইল দেখা, Check All, তারপর **Bulk Approve** বা **Single Approve**।
- নোটিফিকেশন বেলে মডিউল অনুযায়ী pending approval-এর সংখ্যা দেখায়, ক্লিক করলে সেই Approve পেজে যায়।
- প্রতিটা ডকুমেন্টে থাকে Entry By, Approved By, ApprovedDate আর CancelReason।
- Approve হলে তবেই স্টক আর লেজারে প্রভাব পড়ে। **[অনুমান: auto voucher তৈরি হয় approve-এর সময়, `IsAutoVoucher` ফিল্ড আছে]**

**[againERP]** একটা generic `document_status` state machine বানান: `draft → pending → approved → (settled | cancelled)`। সাথে `approved_by`, `approved_at`, `cancel_reason` আর `edit_after_approval` ফ্ল্যাগ রাখুন। প্রতিটা ডকুমেন্ট-টাইপ এই একই কাঠামো ব্যবহার করবে।

---

## 7. ব্যবসায়িক ফ্লো

### 7.1 Purchase
```
Requisition → Requisition Finalize → CS Sheet (দাম তুলনা) → Purchase Order → Goods Receive (GRN)
   → Receive Finalize (দাম চূড়ান্ত, সাপ্লায়ারের দেনা) → Payment → Payment Settlement
শর্টকাট: Direct Purchase (এক ধাপে)
রিটার্ন: Purchase Return (আগের purchase বা receive থেকে)
Goods Receive Against DO (Demand Order-এর বিপরীতে)
Import: PI → LC Opening → Import Costing → LIM Stock In / Imported Stock In
```
- **Receive Finalize**: একাধিক GRN একসাথে নিয়ে প্রতিটা লাইনের Price আর Cost চূড়ান্ত করা হয়। ডিউটিও ধরা হয়। এখান থেকেই Payment-এর "Bill" তৈরি হয়।
- **Purchase Return**: কেনার সময়ের Price, Discount আর GRN Discount ধরে net দাম হিসাব হয়। Remaining qty পর্যন্ত ফেরত দেওয়া যায়।

### 7.2 Sales
```
Quotation ──Order From Quotation──┐
Demand Order (ডিস্ট্রিবিউটর) ──────┼─► Sales Order ─► Delivery Challan (স্টক বের হয়) ─► Invoice/Bill ─► Collection ─► Party Trx Settlement
                                  │                └─► Invoice From Order (challan আর invoice একসাথে)
Direct Sales (invoice+challan+collection এক ফর্মে, কিস্তি সাপোর্ট)
POS, POS Exchange
MRC Profile → MRC Billing (মাসিক রিকারিং বিল)
Sales Return, Damage Return, Delivery Challan Return
Sales Order Settlement (বাকি qty বন্ধ, Reason + পাসওয়ার্ড)
```
- Sales Order থেকে Challan-এ গেলে হিসাব রাখা হয় Ordered, Delivered আর Remaining। Tolerance আর Max Allowed (রপ্তানি PI-র জন্য) সীমাও থাকে।
- Invoice থেকে Challan-এ গেলে হিসাব হয়: Challan Qty − Challan Return − Invoiced = Remaining।
- "Issue To": Customer, Sales Person বা Other।
- `SalesType1`, `SalesMode` (Cash বা Credit), `DeliveryProcessId`, `OrderTakenFrom` (web বা mobile), আর ম্যাপের Latitude/Longitude (মোবাইল অ্যাপ থেকে অর্ডার নেওয়ার জন্য)।

### 7.3 Inventory আর Transfer
- স্টকের ৪টা ধরন: **Current, RMA, Bad, WIP**। প্রতিটা ওয়্যারহাউসে প্রতিটা ধরনের আলাদা হিসাব থাকে।
- **Internal Transfer**: FromStockType থেকে ToStockType, From Warehouse থেকে To Warehouse। প্রতিটা লাইনে সিরিয়াল বা পরিমাণ থাকে, চাইলে Requisition-এর বিপরীতে।
- **Location Transfer**: Requisition Finalize → Transfer Order → Transfer Challan → Transfer Receive। প্রতিটা ধাপ আলাদা approve হয়।
- **Stock Adjustment**: স্টক যোগ বা বিয়োগ, খরচসহ। **Item Issue**: অভ্যন্তরীণ ব্যবহারের জন্য মাল বের করা। **Party Adjustment / Adjustment Claim / Claim Finalize**: পার্টির ব্যালেন্স সমন্বয়।
- রিপোর্ট: Available Stock, Stock Position, With Cost / Price, Date-wise, Aging, Stock vs Stock Ledger (মিলিয়ে দেখা), Opening Inventory।

### 7.4 RMA (ওয়ারেন্টি)
```
Complain Receive (System / Previous / Unknown Sales) → Engineer Assign → Testing & Diagnostic → Servicing → Customer Delivery
                └→ Replacement Claim (সাপ্লায়ারের কাছে) → Replacement Receive (নতুন সিরিয়াল) → Customer Delivery
```
- Complain লাইনে থাকে: Invoice, Serial, Warranty বা Service Warranty বাকি আছে কিনা, Problem (Setup › Problem, event অনুযায়ী), Spare Product, Service charge, Discount আর DeliveryPromiseDate।
- Customer Delivery-তে আগের প্রোডাক্ট বা সিরিয়াল ফেরত যায় অথবা নতুন প্রোডাক্ট বা সিরিয়াল যায়। AdjustmentRequired, AdjustmentType আর AdjustedAmount দিয়ে টাকার পার্থক্য সমন্বয় হয়।
- কাস্টমারে **RMA Locked** ফ্ল্যাগ আছে (ওই কাস্টমারের RMA বন্ধ রাখা)।

### 7.5 Accounts
- Chart of Accounts ৫ স্তরে: **Group → Sub-Group → Control → Subsidiary → Accounts (Ledger)**।
- Accounts ফিল্ড: CategorizationId, Currency, ExchangeRate, OpeningBalance, LocationWiseOpeningLists। Edit-এ `IsOpeningBalanceFinalized` (opening একবার চূড়ান্ত হলে আর বদলানো যায় না)।
- **Cash/Bank Identification**: কোন Control বা Subsidiary বা Account Cash আর কোনটা Bank, তা চিহ্নিত করা, সাথে CheckAccountsBalance (ঋণাত্মক ব্যালেন্স আটকানো)।
- যেসব মাস্টারের নিজস্ব লেজার (`AccountsId`) আছে: **Customer, Supplier, Bank Account, Employee, Commission/Funding Head**। Product-এর ৯টা আলাদা হেড আছে (§8.1)।
- ভাউচার: **Debit (Payment), Credit (Receive), Contra, Journal, Voucher From Template**। Approve › Voucher, তারপর Posting (Accounts Closing-এর আগে)।
- রিপোর্ট: Chart of Accounts, Accounts Ledger, Day Book, Receive & Payment, Trial Balance, Income Statement, Balance Sheet, Voucher Analysis।
- Payment Mode মাস্টারে দুটো ফ্ল্যাগ: `NeedDetail` (ব্যাংক বা নম্বর লাগবে) আর `IsMaintainCheque` (চেকের পাতা register থেকে)। Collection Mode-এ আছে `IsAutoHonor`।

### 7.6 HR, Production, Lead, Task (এই কোম্পানিতে বন্ধ, শুধু মেনু থেকে)
- **HR Setup**: Department, Section, Designation, Shift (InTime, LastInTime, OutTime), Operational Unit, Holiday, Annual Holiday, Office Calendar, Leave Type/Policy, Employee-wise Leave Policy, Salary Scale/Component/Allowance Config, Attendance, Loan, Advance, PF, OT Policy, HR Policy।
- **HR Task**: Attendance In/Out, Bulk Attendance, Leave/Loan/Outdoor Duty Application, Late & Early Penalty, Salary Generate। Approve-এ Leave Application (Reliever) আলাদা ধাপ।
- **Employee মাস্টার** বেশ সমৃদ্ধ: ঠিকানা (present/permanent), Emergency Contact, Education, Professional Qualification, Employment History, Supervisor, Banking (Cash%/Bank%), Reference, Salary Component অনুযায়ী Accounts Head, Attendance Device ID।
- **Production**: Material Issue → Conversion Ratio / Conversion (এক প্রোডাক্ট থেকে আরেকটা) → Production Ratio (BOM) → Production।
- **Lead Management**: Lead Source, Communication Status/Type, Lead, Lead Manage। **Task Management**: Task Head, Entry, Assign, Status।

---

## 8. ডেটা মডেল (ফর্ম Save করার সময় যা পাঠায়) [দেখা]
> নিচের ফিল্ডগুলো ফর্ম যা পাঠায় তা থেকে নেওয়া। againERP-তে টেবিল ডিজাইনের জন্য এগুলো চেকলিস্ট হিসেবে ব্যবহার করুন, হুবহু কপি করার দরকার নেই। প্রায় সব লেনদেনে `SelectedCurrency` আর `ExchangeRate` থাকে (multi-currency)।

### 8.1 Setup মাস্টার

**Product** (৩টা আলাদা save ধাপ):
- *Basic*: Code (IsCodeEditable), SerialAvailable, IsActive, ProductGroupId, ProductSubGroupId, ProductCategoryId, BrandId, Model, Name, ShortSpecification, WebName
- *Unit*: PrimaryUnitTypeId, SecondaryUnitTypeId, TertiaryUnitTypeId, SecondaryConversionRatio, TertiaryConversionRatio
- *Stock*: ReorderPoint, MinStockQuantity, IsStockMaintain, IsSaleable, IsAllowNegativeSales, ProductType, ProductState
- *নিয়ম*: ReturnAllowedDays, CreditNoteAllowedDays, DebitNoteAllowedDays
- *Warranty*: IsWarrantyAvailable, IsLifeTimeWarranty, WarrantyDays, AdditionalWarrantyDays, IsServiceWarranty, ServiceWarrantyDays
- *Accounts mapping (৯টা)*: PurchaseAccountsId, PurchaseReturnAccountsId, CurrentSalesAccountsId, BadSalesAccountsId, RMASalesAccountsId, SalesReturnAccountsId, DamageReturnAccountsId, DepreciationAccountsId, IssueAccountsId
- *Weight*: WeightMeasuringUnitId, NetWeight, GrossWeight
- *Physical*: Height, Width, Thickness, CapacityId, Capacity, OriginCountryId, HSCodeId
- **ProductDimension (variant)**: ProductDimensionId, MeasurementId, SizeId, StyleId, ColorId, SKUCode। একটা প্রোডাক্টের একাধিক variant থাকতে পারে, আর **সব লেনদেনের লাইনে ProductId + ProductDimensionId** থাকে।
- **Related বা Spare product**: ProductId, RelatedOrSpareProductId (RMA-তে spare হিসেবে লাগে)

**Unit Type**: Code, Name, RoundingPatternType, FractionalLength।
**Product hierarchy**: Group(Code, Name) → SubGroup(+GroupId) → Category(+Group, SubGroup)। Brand(Code, Name)।

**Price Type / Discount Type**: Code, Name, IsDetailPrice (বা IsDetailDiscount), IsLimitChange, RangeType, Currency, LowerLimit, UpperLimit।
**Price / Discount** (প্রোডাক্ট অনুযায়ী, পরিমাণের স্ল্যাবসহ):
- ফিল্টার: Group, SubGroup, Category, Brand, Model, Product, UnitLevel, TypeIds, IsAvailableStock
- লাইন: ProductId, ProductDimensionId, UnitTypeId, `PriceOrDiscountTypeInfos[]`
  - স্ল্যাব: Value, LowerRange, UpperRange, UpperPrice, LowerPrice (Discount-এ আছে IsAbove = "এবং তার বেশি")

**Price/Discount Configuration**: কোন Type কোথায় প্রযোজ্য। মাত্রাগুলো: Own বা Child Company, Date Limit, Location, User, Customer Group, Customer Grade, Dealer, Product Group, Brand, Category।
**Commission/Funding Head**: ControlName, Code, Name, AccountsId। **Rate**: HeadId, CommissionOrFundingFor, প্রোডাক্ট অনুযায়ী DiscountType, পরিমাণ আর QuantityRange।

**Customer**: Type, IsCombined, IsActive, IsCreateAsCompany, Code, CustomerGroupId, CustomerGradeId, Name, Address, PhoneNo/1/2, Fax, Email, SalesPersonId, ContactPerson, ContactPersonMobile, ProfessionId, Designation, ReferenceName, ReferenceContactNo, TransactionType (Cash বা Credit), IsWalkIn, Currency, ExchangeRate, **OpeningBalance, OpeningDate, ChequeDishonourBalance, ChequeDishonourOpeningDate, CreditLimit, LedgerLimit, ConditionalLimit, SecurityMoney, ValidTill, CreditAllowedDays, IsLocked, IsRMALocked**, AccountsId, GeoAreaId, DisRouteId, VATRegNo, TaxRegNo, NIDNo, Remarks, Latitude, Longitude।
(Edit › Customer-এ শুধু আর্থিক ফিল্ডগুলো আলাদাভাবে বদলানো যায়, আলাদা permission দিয়ে।)

**Supplier**: Code, SupplierGroupId, SupplierGradeId, Name, Address, Phone, Fax, Email, URL, ContactPerson, ContactPersonMobile, ProfessionId, Designation, BankId, BankAccountName, BankAccountNumber, Type, Currency, OpeningBalance, OpeningDate, AccountsId, VATRegNo, TaxRegNo, IsActive।

**Bank**: Bank(Code, Name) → BankBranch(Code, Name, BankId, RoutingNo, ContactNo, Address) → BankAccount(Name, IsOwnBankAccount, BankBranchId, BankACNo, AccountsId)।
**Employee**: §7.6 দেখুন, আর Code, Name, IsActive, Designation, Department, Section, Role, DOB, DOJ, Email, NID, Passport, AccountsId, SalaryType, PaymentMode, Cash%, Bank%, ShiftId, Religion, Nationality, Gender, BloodGroup, EmployeeCategory, AttendanceDeviceWiseId, OperationalUnitId, WorkingLocationId।
**Template**: Header(Name, Description); TermsAndConditions(EventName, SubEventName, TemplateHeaderId, Detail); Voucher Template(Header, Detail, Description, lines: AccountsId, ProjectId, Particulars, Debit, Credit)।
**Problem**: EventName, SubEventName, Name। **Shift**: IsActive, Name, InTime, LastInTime, OutTime।
**Report Design Config**: Event, Sub-Event অনুযায়ী paper size, margin, font, header বা footer image, কোন ফিল্ড দেখাবে, title, sequence।
**Change Label Caption**: ফর্মের লেবেলের নাম কোম্পানি অনুযায়ী বদলানো।

### 8.2 লেনদেন (Header + Lines)

**Direct Purchase**
- Header: PurchaseType, Currency, PurchaseDate, SupplierId, PaymentModeId, ReferenceNo/Date, Remarks, TermsAndConditionsId/Detail, PaymentTermsId/Detail, DiscountType/Value/Amount (bill discount), OperationTypeId, IsGovtDutyApplicable, CalculatedGovtDuty, IsSaleable
- Line: ProductId, ProductDimensionId, UnitTypeId, WarehouseId, Quantity, Price, DiscountType/Value/Discount, Cost, Total, **MRP**, IsWarrantyAvailable, WarrantyDays, IsIncludingGovtDuty, GovtDutyLists[], SerialLists[]
- Serial: Serial, AdditionalSerial (যেমন IMEI-2), OriginalSerial, IsEditable
- Edit-এ আলাদা করে যায় DeletedProductLists আর DeletedSerialLists

**Receive Finalize**: Date, SupplierId, OperationTypeId, Lines (ReceiveId, ProductId, DimensionId, UnitTypeId, Quantity, Price, Cost, Total, GovtDutyLists)
**Purchase Return**: SupplierId, Date, ReturnAmount, Remarks, Reason, ReturnFrom, Lines (Product, Warehouse, Quantity, ReceiveId, Price, Cost, PriceAtPurchase, DiscountAtPurchase, GoodsReceiveDiscountAtPurchase, SerialLists)

**Quotation**
- Header: CustomerId, BuyerId (original buyer), CustomerDetail, Date, Reference, SalesPersonId, RequestedBy, OperationTypeId, T&C, Shipment (Type, Date, Mode, DeliveryFrom, Warehouse, Place), Contact, Transport (Transport, Depot, Type, Vehicle, Driver), **Letter-ধাঁচের অংশ** (Salutation, AttentionTo, Designation, Company, Address, Subject, HeaderDetail), BankGuaranteeRequired, WorkOrderRequired, PaymentMode, PromisedDate, PaymentTerms, Amount, Discount, GovtDuty, Charges
- **Tender বা Commission অংশ**: CommissionTakenBy, Address, Contact, Type, Value, Amount
- **Security অংশ**: EarnestMoney (%, Amount, RefNo, RefundDate), SecurityDeposit (একই), BankGuarantee (%, Amount, No, Margin, BankExpense, BankId, RefundDate)
- Lines: Product, Dimension, Unit, Quantity, Price, Discount, Total, ShortSpec, Warranty, ServiceWarranty, GovtDuty
- SampleLists: Product, Quantity, RequiredDate। Conclusion টেক্সট।

**Sales Order**
- Header: OrderDate, CustomerId, CustomerDetail, DeliveryProcessId, BuyerId, SalesPersonId, SalesType, SalesType1, Reference, OperationTypeId, T&C, Remarks, Shipment, Warehouse, PaymentMode, PromisedDate, PaymentTerms, Currency, OrderAmount, **OrderDiscountType/Value/Discount**, Delivery/Contact/Transport, SalesMode, CalculatedGovtDuty, QuotationId, DemandOrderId, **BenefitProductLists** (trade offer-এর ফ্রি প্রোডাক্ট), Latitude, Longitude, OrderTakenFrom
- Line: Product, Dimension, Unit, ProductType, Quantity, QuotedQuantity, PriceBeforeAddedDuty, Price, Discount (Type, Value, %), **AdditionalDiscount (Type, Value, %)**, InvDiscount (bill discount ভাগ হয়ে প্রতিটা লাইনে), Total, ShortSpec, Warranty, PriceTypeId, DiscountTypeId, IsIncludingGovtDuty, IsAddGovtDutyWithPrice, IdentificationCode, GovtDutyLists, **CommissionLists, FundingLists** (RateId, HeadId, RateType, RateValue, RateAmount)
- Benefit: Product, Quantity, BenefitEffect, PackageId

**Delivery Challan**: SalesOrderId, ChallanDate, WarehouseId, Delivery/Contact/Transport, Export (LCReceiveId, ExportProformaInvoiceId, PortOfLoading, Certification), DeliveryTerms, Remarks। Lines: Product, Dimension, Unit, Quantity, IsStockMaintain, SerialAvailable, SerialLists (Serial, AdditionalSerial, Warehouse), NonSerialWarehouseLists (একটা লাইন কয়েকটা ওয়্যারহাউস থেকে), Package, PI, LC।
**Invoice (Challan থেকে)**: InvoiceDate, CustomerId, SalesPersonId, Amount, Discount, SalesMode। Lines: ChallanId, Product, Quantity, Price, Discount, AdditionalDiscount, OrderDiscount, GovtDuty, Commission, Funding, SerialLists।
**Invoice From Order**: Challan আর Invoice একসাথে, SalesInvoiceCharges (অতিরিক্ত চার্জ) সহ।

**Direct Sales** (সবচেয়ে পূর্ণাঙ্গ)
- Header: CallFrom, SalesType1, InvoiceDate, CustomerId, SalesPersonId, SalesMode, Reference, Remarks, OperationTypeId, T&C, InvoiceAmount, Discount, **Collection** (তাৎক্ষণিক আদায়), Commission, GovtDuty, Charges, Shipment, Transport, TransactionFrom, SalesType, **IsInstallmentSales, BookingDate, BookingPercentage, BookingAmount, BookingAndInstallmentDetail**, RoundingAmount, BenefitProductLists
- Line: Sales Order-এর মতো, সাথে WarehouseId, ChallanId, NotEditableQuantity, ActualQuantity
- CollectionInfoLists: PaymentModeId, Amount, BankId, ChequeNo, ChequeDate, DepositedBankId
- কিস্তি: DownPayment start, %, Duration, NumberOfInstallment, FixedSlotAmount, InstallmentStart, Interest/Margin Rate

**Sales Return**: CustomerId, Date, ReturnAmount, ReturnGovtDutyAmount, Remarks, Reason, TransactionFor, ReturnFrom। Lines: Product, InvoiceId, Price, Cost, **PriceAtSold, DiscountAtSold, AdditionalDiscountAtSold, InvoiceDiscountAtSold**, SerialLists, Warehouse।
**Internal Transfer**: TransferDate, RequestedById, Remarks, FromStockType, ToStockType। Lines: Product, Unit, FromWarehouse, ToWarehouse, Quantity, SerialLists, NonSerialWarehouseLists, RequisitionId।

**Complain Receive (RMA)**: CustomerId, Date, RequestedBy, Remarks, AgainstSystemSales / UnknownSales / PreviousSales, TotalChargeAmount, Charges, T&C। Detail: InvoiceId, Product, Serial, Cost, Warranty, ServiceWarranty, IsOnlyService, Problems[], Spare[] (Product, Qty, Price, Discount), Spare বা Service-এর মোট, DeliveryPromiseDate।
**Customer Delivery**: CustomerId, Date, Charges, Discount। Detail: ComplainReceiveId, Previous (Product, Serial), New (Product, Serial), Cost, IsAdjustmentRequired, AdjustmentType, AdjustedAmount, DeliveryType, OnlyPaidService, Spare।
**Replacement Claim**: SupplierId, ClaimDate, Detail (ComplainReceiveId, Product, Serial, Cost, Problems)। **Replacement Receive**: Detail (ClaimId, Previous বা New Product আর Serial, Cost, Adjustment, ReplacementType)।

**Collection**: Date, Currency, CollectedAmount, CustomerId, SalesPersonId, CollectedBy, MRNo (Money Receipt), Remarks, SecurityDepositAmount, SecDepRecoveryDate, OthersAdjAmount, **CollectionAgainst**, OperationTypeId, CollectionFrom।
- Detail (mode): PaymentModeId, Amount, BankId (কাস্টমারের ব্যাংক), ChequeNo, ChequeDate, AgainstBouncedCheque, ChequeInfoId, DepositedBankId
- Mapping: SalesOrderId বা InvoiceId, Amount
- DutyAdjLists (উৎসে কাটা VAT বা Tax)

**Payment**: Date, Currency, PaidAmount, SupplierId, PaidBy, ReferenceNo, Remarks, SecurityDeposit, OthersAdj, **PaymentAgainst** (Adv, Pre, PO, Bill, LC), ForeignPayment, OperationTypeId (Regular, Advance Payment, Refund To Customer), PaidTo (S বা C)।
- Detail: PaymentModeId, Amount, BankId, ChequeNo, ChequeDate, AgainstBouncedCheque, ChequeInfoId, IsMaintainCheque, **ChequeBookRegisterDetailId**
- Mapping: OrderId (PO), FinalizeId + ReceiveId (Bill), ProformaInvoiceId (LC), Amount

**Voucher (Debit, Credit, Contra, Journal)**: Currency, OperationType (CC, BC ইত্যাদি), Date, Description, ExchangeRate, TransitAccountsId (Contra)।
- Line: AccountsId, ProjectId, Particulars, Debit, Credit, BankId, DepositedBankId, ChequeNo, ChequeDate, ChequeBookRegisterDetailId, TransactionNo, DepositDate বা CreditDate

**Party Transaction Settlement**: SettleByLists (Collection বা Sales Return), SettleToLists (Invoice), TranSettleBy, TranSettleTo।
**Payment Settlement**: PaymentInfo, তারপর ReceiveFinalizeInfo।
**Data Import**: Customer Excel (PhoneNo, Name, Address, Email, SalesPersonCode, OpeningBalance); Product Excel (Product_Code, SKU_Code, Name, Group, SubGroup, Category, Brand, Model, UnitType, Serial_Y_N, Warranty_Y_N, WarrantyDays, ReturnAllowedDays, ShortSpecification)।

---

## 9. কানেকশন ম্যাট্রিক্স (কোন লেনদেন কোন মাস্টার ব্যবহার করে) [দেখা]

| লেনদেন | Customer | Supplier | Product | Price/Disc | Employee | Location/WH | Bank | Acc.Head | Transport | T&C | Serial |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Quotation | ● | | ● | ● | ● | ● | ● | | ● | ● | |
| Sales Order | ● | | ● | ● | ● | ● | | | ● | ● | |
| Delivery Challan | | | | | | ● | | | ● | ● | ● |
| Invoice | ● | | | | ● | | | | | | ● |
| Direct Sales | ● | ● | ● | ● | ● | ● | ● | | ● | ● | ● |
| Sales Return | ● | | ● | | | ● | | | | | ● |
| Direct Purchase | | ● | ● | | | ● | | | | ● | ● |
| Receive Finalize | | ● | | | | | | | | | |
| Purchase Return | | ● | ● | | | | | | | | ● |
| Internal Transfer | | | ● | | ● | ● | | | | | ● |
| Complain Receive | ● | | ● | | ● | | | | | ● | ● |
| Customer Delivery | ● | | ● | | ● | ● | | | | | ● |
| Replacement Claim/Receive | ● | ● | ● | | ● | | | | | | ● |
| Collection | ● | ● | | | | | ● | | | | |
| Payment | ● | ● | | | | | ● | | | | |
| Cheque Treatment | ● | ● | | | | ● | ● | | | | |
| Debit/Credit/Contra | | | | | | | ● | ● | | | |
| Journal | | | | | | | | ● | | | |

সব লেনদেনে Currency আর Feature flag ব্যবহার হয়।

---

## 10. Cross-cutting ফিচার [দেখা]

| ফিচার | বিবরণ |
|---|---|
| **Serial / IMEI** | Product.SerialAvailable চালু থাকলে প্রতিটা লেনদেনে সিরিয়াল লাগে। এন্ট্রি দেওয়ার তিন উপায়: একটা একটা স্ক্যান, bulk স্ক্যান, বা ফাইল আপলোড। Serial আর AdditionalSerial দুটোই রাখা যায়। **Advance Search › Serial** একটা সিরিয়ালের পুরো ইতিহাস দেখায়, ১৭ ধরনের ঘটনা পর্যন্ত: Purchase, Purchase Return, Import, Stock Adjustment, Previous Sales, Challan, Challan Return, Sales, Sales Return, Damage Return, Location Transfer, Internal Transfer, Complain, Replacement Claim, Replacement Receive, Customer Delivery, Conversion। সাথে ওয়ারেন্টির বাকি মেয়াদ। |
| **Product Search** | Stock Type, Location, Warehouse অনুযায়ী স্টক, গড় খরচ, শেষ purchase বা sale, সিরিয়াল |
| **Bar Code** | প্রোডাক্ট বা সিরিয়ালের লেবেল, দাম বা প্রাইস কোড আর কোম্পানির নামসহ |
| **Govt Duty** | HS Code বা Location অনুযায়ী রেট। প্রতিটা লাইনে GovtDutyLists (Duty Name, Rate Type, Rate Value, Amount/Unit, Exempted)। "Including" বা "Add With Price" মোড। Collection বা Payment-এ উৎসে কাটা ডিউটির সমন্বয়। |
| **Multi-currency** | প্রতিটা ডকুমেন্টে Currency আর ExchangeRate। Home-এ CurrencyRateList আপডেট করা যায়। |
| **Price control** | Price Type-এর Lower/Upper limit। Configuration দিয়ে লোকেশন, ইউজার বা কাস্টমার গ্রুপ অনুযায়ী দাম। বিক্রির ফর্মে "Configured Price Info" popup। |
| **Credit control** | Credit, Ledger আর Conditional Limit (মেয়াদসহ), Credit Days, Locked |
| **History** | Purchase-এ শেষ ৩টা কেনার দাম, Sales-এ এই কাস্টমারের কাছে শেষ ৩টা বিক্রির দাম |
| **Trade Promotion** | Trade Offer আর Package। "Check Trade Offer" চাপলে BenefitProductLists যোগ হয়। |
| **Print** | Report Design Config (§8.1), Paper Size, Orientation, With Header, POS Format, Show Previous Due, Total In Single Cell, Header Image |
| **Bulk SMS, Error Log** | Others মেনু |
| **Mobile App** | ইউজার অনুযায়ী অনুমতি, অর্ডারে ম্যাপের অবস্থান (Lat/Long) |

---

## 11. Cheque সিস্টেম — পূর্ণ স্পেক [দেখা]

### 11.1 সেটআপ
- Bank → Branch → **Bank Account** (IsOwnBankAccount, AccountsId হলো Bank হেড)
- **Cheque Book Register**: প্রতিটা ব্যাংক অ্যাকাউন্টের চেক বইয়ের পাতা নম্বর নিবন্ধন। প্রতিটা পাতা আলাদা সারি (`ChequeBookRegisterDetailId`)।
- **Cheque Leaf Cancel/Refresh**: পাতা বাতিল, অথবা ব্যবহৃত পাতা আবার অব্যবহৃত করা।
- Feature: `MaintainChequeBookRegister` = true। তাই চেক নম্বর শুধু অব্যবহৃত পাতার ড্রপডাউন থেকে বাছাই করা যায় (`FetchUnusedChequeNosByBankAccount`)।
- Payment Mode "Cheque": NeedDetail = true, IsMaintainCheque = true।
- বিশেষ অ্যাকাউন্ট হেড: **"Advanced Cheque Issue"** (ইস্যু করা কিন্তু এখনো ক্লিয়ার হয়নি), **Cheque in Hand** (পাওয়া চেক), **Bank Clearing House / Transit A/C** (Contra)।

### 11.2 Cheque Type
- **IssuedCheque**: আমরা দিই (Payment, Debit Voucher, Contra থেকে)। পার্টি হলো Supplier।
- **ReceivedCheque**: আমরা পাই (Collection, Credit Voucher, Direct Sales থেকে)। পার্টি হলো Customer।

### 11.3 Status state machine (সার্ভারের নিয়ম)
| বর্তমান | পরে যেতে পারে |
|---|---|
| **N** Not Treated | S (Send), B (Balance Adjusted) |
| **S** Send | H (Honor), D (Dishonor) |
| **D** Dishonor | S (আবার পাঠানো), B |
| **H** Honor | কিছু না (চূড়ান্ত) |
| **B** Balance Adjusted | কিছু না (চূড়ান্ত) |

### 11.4 Cheque Treatment পেজ
- ফিল্টার: Cheque Type, Date From/To, Status, Location, Own Bank, Customer বা Supplier (৩ অক্ষর লিখলে খোঁজে), Cheque No।
- তালিকার কলাম: ChequeNo, ChequeDate, Bank, Amount, Status, SendBank, Party (Code, Name, Address, Phone), Collection বা Payment No ও তারিখ, VoucherNo, Location।
- কাজ: চেক বাছাই (Check All দিয়ে একসাথে), Treatment Status (শুধু অনুমোদিত পরের ধাপ), Treatment Date, Cheque Sending Bank (N থেকে সরানোর সময় বাধ্যতামূলক; Issued Cheque-এ চেকের নিজের ব্যাংক নিজে থেকে বসে)।
- Save করলে প্রতিটা চেকের জন্য যায়: `{ChequeInfoId, PreviousStatus, Status, StatusDate, PreviousTreatmentBankId, TreatmentBankId, VoucherId, ChequeType}`। আগের অবস্থা সংরক্ষিত থাকে, তাই ইতিহাস রাখা যায়।

### 11.5 ইস্যুর পথ
1. **Payment** (সাপ্লায়ার): Mode = Cheque, তারপর Bank, অব্যবহৃত পাতা, Cheque Date, Amount। Multi-mode সম্ভব, একই চেক নম্বর দুবার দেওয়া যায় না। Save করলে চেক N অবস্থায় যোগ হয়।
2. **Debit Voucher**: "Cheque Issue" টিক দিন।
   - **Auto Honor** (ডিফল্ট চালু): Credit হয় সরাসরি **Bank** হেডে, Treatment লাগে না।
   - Auto Honor বন্ধ: Credit হয় **Advanced Cheque Issue** হেডে, পরে Treatment-এ Honor করতে হয়।
3. **Contra**: Issued Cheque, Instant অথবা Eventual (Transit A/C)।

### 11.6 বাউন্স হলে
- Payment বা Collection ফর্মে "Against Bounced Cheque" টিক দিয়ে বাউন্স চেক খুঁজুন (`*` দিলে সব আসে)। সিস্টেম দেখায় Cheque Amount, Adjusted আর Rest। নতুন পেমেন্ট Rest-এর বেশি হতে পারে না।
- Customer-এ `ChequeDishonourBalance` আলাদা থাকে।

### 11.7 অ্যাকাউন্টিং [অনুমান — §16.6-এ আসল নমুনা দিয়ে সংশোধিত, ওটাই ঠিক]
| ঘটনা | Dr | Cr |
|---|---|---|
| Payment (চেক) approve | Supplier | Advanced Cheque Issue |
| Honor | Advanced Cheque Issue | Bank |
| Dishonor | (উল্টো) Advanced Cheque Issue | Supplier |
| Collection (চেক, auto-honor নয়) | Cheque in Hand | Customer |
| Received cheque Honor | Bank (Deposited) | Cheque in Hand |
| Debit Voucher, Auto Honor | খরচ | Bank |

**যাচাইয়ের উপায়**: Accounts Ledger-এ "Advanced Cheque Issue" হেডের ব্যালেন্স যেন N আর S অবস্থার ইস্যু করা চেকের মোট টাকার সমান হয়।

### 11.8 রিপোর্ট
Status Wise Cheque Detail, Cheque In Hand, Advance Cheque Issued, Cheque History, Customer/Supplier-wise Cheque Performance, Bounce Cheque Analysis। অপশন: Current বা Back-dated position; তারিখ তুলনা Cheque, Payment বা Treatment Date ধরে; ব্যাংক তুলনা চেকের ব্যাংক বা Treatment ব্যাংক ধরে।

### 11.9 লাইভ পরিসংখ্যান (২৮ অক্টোবর ২০২৬)
Issued: H 1546, B 63, N 37, D 3, S 1 (মোট ১৬৫০)। Received: H 15, N 2, B 1 (মোট ১৮)। ৬টা ব্যাংক অ্যাকাউন্টে ৬ থেকে ১৪২টা অব্যবহৃত পাতা আছে, ১টা অ্যাকাউন্টে ০।

> **againERP-তে অবস্থা:** Cheque Treatment (bulk, D → S, D → B) আর Cheque Reports বানানো হয়েছে। দেখুন §19.1।

### 11.10 [againERP] টেবিল
```
bank_accounts(id, branch_id, name, ac_no, is_own, account_id)
cheque_books(id, bank_account_id, start_no, end_no, received_at)
cheque_leaves(id, cheque_book_id, leaf_no, status ENUM('unused','used','cancelled'), used_ref_type, used_ref_id)
cheques(id, type ENUM('issued','received'), party_type, party_id, bank_id, cheque_no, cheque_date,
        amount, currency, status CHAR(1), status_date, treatment_bank_id,
        source_type ENUM('payment','collection','voucher','direct_sales'), source_id, voucher_id, location_id)
cheque_status_history(id, cheque_id, from_status, to_status, status_date, from_bank_id, to_bank_id, voucher_id, user_id, created_at)
cheque_status_transitions(from_status, to_status)   -- N→S, N→B, S→H, S→D, D→S, D→B
```

---

## 12. রিপোর্টের তালিকা (Reports মেনু)
- **Import**: PI, LC Opening, Import Costing, LIM Stock In (+Analysis), Imported Stock (+Pending, Analysis)
- **Export**: PI, Commercial Invoice (+Documents)
- **Requisition, Item Issue** (+Analysis)
- **Purchase**: Req Finalize, CS Sheet, PO (+Analysis), GRN, Receive Finalize, Direct Purchase, Purchase Analysis, Return (+Analysis)
- **Production**: Material Issue, Conversion (+Analysis), Production Ratio, Production (+Analysis)
- **Stock**: Adjustment (+Analysis, With Cost), Available Stock, Stock Position, With Cost / Price / Cost & Price, Date-wise (+Value), Aging (+Cost), Stock vs Stock Ledger (+Cost)
- **Sales**: Quotation, Demand Order (+Analysis), Sales Order (+Analysis), MRC Profile, Challan (+Analysis), Challan Return (+Analysis), Invoice, Invoice (False), Sales Analysis, Promotional Sales, Sales Matrix, Sales & Collection, Discount, **Gross Profit**, Commission, Sales Return (+Analysis), Damage Return
- **Adjustment, Transfer** (+Analysis, With Cost), **RMA** (Complain, Delivery, Replacement Claim/Receive, প্রতিটার Analysis)
- **Ledger**: Party, Supplier, Product (+Value)। **Outstanding** (+Aging)
- **Accounts**: Collection (+Multi-party, Analysis), Payment (+Analysis), Voucher (+Analysis), Cheque Treatment, Bounce Cheque, Chart of Accounts, Accounts Ledger, Accounts Analysis, Receive & Payment, Day Book, Fund Transfer/Receive, Security Instrument, **Trial Balance, Income Statement, Balance Sheet**
- **HR**: Attendance History/Report, Leave, Loan, Leave Analysis, Outdoor Duty, Salary Sheet
- **Achievement**: Collection Target vs Achievement, Sales Target vs Achievement
- **List**: Product, Customer, Supplier, Employee, Price List। **Opening**: Inventory (+Cost)। **Note**: Debit/Credit Note (+Analysis)
- প্রতিটা রিপোর্টে Export Format (PDF বা Excel ইত্যাদি) বাছাই করা যায়, আর লোকেশন ড্রপডাউনে শুধু যেসব লোকেশনে Report Access আছে সেগুলো আসে।

---

## 13. যা বিশ্লেষণ করা হয়নি
- এই কোম্পানির লাইসেন্স বা permission-এ বন্ধ মডিউলগুলো: Purchase Order, GRN (Task), CS Sheet, Requisition, POS, Demand Order, MRC, Damage Return, Location Transfer, Stock/Party Adjustment, Production, Import/Export entry, HR Task, Lead, Task Management, Posting, Accounts Closing, Fund Transfer, Security Instrument, Geo/Distribution, Trade Offer setup, Target, User Level/Role setup, Accounts Permission UI, Software Access Time UI। এগুলোর ক্ষেত্রে শুধু মেনু বা রিপোর্টের নাম আর সংশ্লিষ্ট পেজ থেকে পাওয়া কাঠামো ব্যবহার করা হয়েছে।
- সার্ভারে Approve বা Posting-এর সময় কোন হেডে Dr/Cr হয়, সেই আসল লজিক (শুধু অনুমান করা হয়েছে, §11.7)।
- ডেটাবেজের কাঠামো (এখানে শুধু ফর্মের ফিল্ড থেকে অনুমান)।
- Dashboard-এর widget।

---

## 15. Customer আর Supplier Ledger সিস্টেম (বিস্তারিত) [২৮ অক্টোবর ২০২৬]
> নোট: এই সেকশনটা পরে যোগ করা হয়েছে, তাই §14 (Roadmap)-এর আগে বসানো।

> পদ্ধতি: Party Ledger, Supplier Ledger, Outstanding, Outstanding Aging, Settlement আর Customer/Supplier ফর্মের লজিক পড়া হয়েছে। কয়েকটা নমুনা ledger PDF খুলে কাঠামো দেখা হয়েছে। এখানে কোনো পার্টির নাম বা টাকার অঙ্ক রাখা হয়নি। Debit/Credit Note আর Party Adjustment-এর এন্ট্রি পেজ এই ইউজারের জন্য বন্ধ।

### 15.1 মূল কাঠামো: Control Account আর Sub-ledger [দেখা + অনুমান]
- প্রতিটা কাস্টমার বা সাপ্লায়ারের জন্য **আলাদা GL হেড তৈরি হয় না**। নমুনা হিসেবে দেখা ৪ জন কাস্টমার আর ৩ জন সাপ্লায়ার, সবার `AccountsId` = null।
- সব কাস্টমারের লেনদেন যায় একটা কমন **control account**-এ: **"Accounts Receivables"**। সাপ্লায়ারদের যায় **"Accounts Payable"**-এ। এর পাশে আছে "Foriegn Payables" (বিদেশি সাপ্লায়ার) আর "Acc Payable RMA"। [অনুমান: সাপ্লায়ারের Type = Foreign হলে Foreign Payables-এ যায়]
- Collection ভাউচারের নমুনায় দেখা গেছে **Dr Cash, Cr Accounts Receivables**, যা উপরের কথা নিশ্চিত করে।
- **Party Ledger হলো এই control account-এর sub-ledger।** এটা GL থেকে নয়, সরাসরি লেনদেনের ডকুমেন্ট (Invoice, Collection, Purchase, Payment ইত্যাদি) থেকে তৈরি হয়। তাই সব কাস্টমারের ledger ব্যালেন্সের যোগফল AR হেডের ব্যালেন্সের সমান হওয়া উচিত।
- চাইলে কোনো নির্দিষ্ট পার্টিকে আলাদা হেডে পাঠানো যায়। Customer আর Supplier ফর্মের "Accounts Ledger" ফিল্ডে যেকোনো হেড খুঁজে বসানো যায় (override)।

```
GL:   Accounts Receivables (Control)  ←── সব কাস্টমারের লেনদেনের যোগফল
          ├─ Customer A ledger (sub-ledger, ডকুমেন্ট থেকে তৈরি)
          ├─ Customer B ledger
          └─ ...
GL:   Accounts Payable (Control) / Foreign Payables / Acc Payable RMA
          ├─ Supplier X ledger
          └─ ...
```

### 15.2 পার্টি মাস্টারের আর্থিক ফিল্ড
**Customer** (Setup › Customer, আর আলাদা permission-এ Edit › Customer-এ শুধু আর্থিক অংশ):

| ফিল্ড | অর্থ |
|---|---|
| Type | `C` Customer (ডিফল্ট) অথবা `B` Buyer। Buyer মানে আসল ক্রেতা: অর্ডার বা ইনভয়েসে Customer-এর পাশাপাশি `BuyerId` আলাদা রাখা যায়, যেমন একজন dealer অন্য কারো জন্য কিনছে। |
| TransactionType | `Cash`, `Credit` অথবা `Both`। বাকিতে বিক্রি করা যাবে কিনা। |
| IsWalkIn | Walk-in কাস্টমার (খুচরা, নাম ছাড়া) |
| IsCombined | একই পার্টি কাস্টমার আর সাপ্লায়ার দুটোই। Supplier Ledger রিপোর্ট শুধু Non-Combined সাপ্লায়ার দেখায়, তাই combined পার্টির হিসাব এক ledger-এ আসে। [অনুমান] |
| IsCreateAsCompany | পার্টিকে কোম্পানি হিসেবেও তৈরি করা (inter-company) [অনুমান] |
| Currency, ExchangeRate | পার্টির নিজস্ব কারেন্সি |
| OpeningBalance, OpeningDate | শুরুর বকেয়া |
| **ChequeDishonourBalance, ChequeDishonourOpeningDate** | বাউন্স চেকের বকেয়া আলাদা opening হিসেবে রাখা |
| CreditLimit | সর্বোচ্চ বকেয়া |
| LedgerLimit | ledger ব্যালেন্সের সীমা [অনুমান: অর্ডারসহ বা ছাড়া হিসাবের পার্থক্য] |
| ConditionalLimit, ValidTill | একটা নির্দিষ্ট তারিখ পর্যন্ত সাময়িক বাড়তি সীমা |
| SecurityMoney | জামানত |
| CreditAllowedDays | কত দিনের বাকি দেওয়া যাবে (Aging-এর ভিত্তি) |
| IsLocked / IsRMALocked | বিক্রি বন্ধ রাখা / RMA বন্ধ রাখা |
| AccountsId | control account override (§15.1) |

বর্তমান অবস্থা: ~১৬,৫০০ কাস্টমার (বেশিরভাগ walk-in বা খুচরা), আর নমুনায় কারো Credit Limit বা Credit Days সেট করা নেই।

**Supplier**: Type (`Local` বা `Foreign`), Currency, ExchangeRate, OpeningBalance, OpeningDate, AccountsId, আর ব্যাংকের তথ্য (Bank, Account Name, Account No)। Edit › Supplier-এ শুধু আর্থিক অংশ।

### 15.3 কোন লেনদেন ledger-এ কী প্রভাব ফেলে
**Customer Ledger** (Dr মানে কাস্টমারের কাছে পাওনা বাড়ে):

| Transaction Type | Particular | Dr/Cr | উৎস | কীভাবে জানা |
|---|---|---|---|---|
| Opening | Opening Balance | Dr (বা Cr) | Customer মাস্টার | দেখা |
| Sales | Cash অথবা Credit (sales mode) | **Dr** | Invoice, Direct Sales, POS | দেখা |
| Collection | আদায়ের মাধ্যম (Cash, Cheque…) | **Cr** | Collection, Direct Sales-এর collection | দেখা |
| Sales Return / Damage Return | | Cr | Return | অনুমান |
| Cheque Dishonour | | Dr | Cheque Treatment (D) | অনুমান |
| Refund to Customer | | Dr | Payment (Operation Type: Refund To Customer) | অনুমান |
| Party Adjustment | Nature অনুযায়ী | Dr বা Cr | Adjustment › Party Adjustment | অনুমান |
| Debit Note / Credit Note | | Dr / Cr | Note | অনুমান |
| RMA paid service | | Dr | Customer Delivery charge | অনুমান |

**লক্ষ্য করুন:** নগদ বিক্রিও ledger-এ দুই লাইন হিসেবে আসে: একই সময়ে Sales Dr আর Collection Cr, ফলে ব্যালেন্স শূন্য থাকে। অর্থাৎ নগদ আর বাকি, সব বিক্রি একই পথে যায়। শুধু Collection সাথে সাথে হয়ে যায়।

**Supplier Ledger** (Cr মানে সাপ্লায়ারের পাওনা বাড়ে):

| Transaction Type | Particular | Dr/Cr | উৎস | কীভাবে জানা |
|---|---|---|---|---|
| Opening | Opening Balance | Cr (বা Dr) | Supplier মাস্টার | দেখা |
| Purchase | "Purchase Ref. No …" (supplier-এর reference) | **Cr** | Direct Purchase, Receive Finalize | দেখা |
| Payment | মাধ্যম (Cash, Cheque…) | **Dr** | Payment | দেখা |
| Purchase Return | | Dr | Purchase Return | অনুমান |
| Replacement adjustment, Party Adjustment, Debit/Credit Note | | Dr বা Cr | RMA, Adjustment, Note | অনুমান |
| Cheque Dishonour (issued) | | Cr | Cheque Treatment | অনুমান |

[অনুমান] শুধু **approved** ডকুমেন্টই ledger-এ আসে।

### 15.4 ডকুমেন্ট নম্বরের ফরম্যাট [দেখা]
`<TYPE>-<COMPANY+LOCATION CODE>-<YEAR>-<6 DIGIT SEQ>`। যেমন:
- `INV-MITHO-2025-000102`: Invoice, MIT Head Office
- `CL-MITHO-2025-000102`: Collection
- `LP-MITHO-2026-000057`: Local Purchase
- `PM-MITHO-2026-000030`: Payment
- `INV-MITTB-…`: অন্য একটা লোকেশন বা শাখার কোড [অনুমান]

ক্রমিক নম্বর **ডকুমেন্টের ধরন, লোকেশন আর বছর** অনুযায়ী আলাদাভাবে গোনা হয়।

### 15.5 Party Ledger রিপোর্ট (Reports › Ledger › Party)
- **ইনপুট**: Date From/To, Customer/Buyer, Currency, Format (PDF, Excel, Word)।
- **অপশন**:
  - Transaction Summary (`isWithTransaction`)
  - Credit Limit Summary (`isWithMIS`)
  - Product Detail (প্রতিটা ইনভয়েসের প্রোডাক্ট লাইনও দেখাবে)
  - Hyperlink (ডকুমেন্ট নম্বরে ক্লিক করলে সেই ডকুমেন্ট খোলে)
  - Decimal Digit
- **হেডার**: কোম্পানির প্যাড বা লোগো, "Party Ledger of <নাম>", তারিখের রেঞ্জ, Code, Address, Phone, Sales person।
- **টেবিল**: `Date | Transaction Type | Particular | Transaction No. | Dr | Cr | Balance (Dr/Cr)`। প্রথম সারি Opening, শেষে Total।
- **Transaction Summary**: সারি হলো লেনদেনের ধরন (Sales, Collection…), কলাম হলো নির্বাচিত সময় আর শেষ ৩ মাস আলাদা আলাদা।
- **Credit Limit Summary**:
  - Net Receivable (Dr/Cr)
  - Unsettled Order Balance (approve হয়েছে কিন্তু এখনো ডেলিভারি বা ইনভয়েস হয়নি এমন অর্ডারের মূল্য)
  - **Net Receivable (Considering Unsettled Order Value)** = উপরের দুটোর যোগফল। এই সংখ্যাটাই credit limit-এর সাথে তুলনা করা হয়। [অনুমান]
  - নিচে "Credit Allowed Days"।

### 15.6 Supplier Ledger রিপোর্ট (Reports › Ledger › Supplier)
- ইনপুট: Supplier Type (Local বা Foreign), Supplier (শুধু non-combined), Date From/To, Currency, Format, With Hyperlink।
- টেবিল একই: `Date | Transaction Type | Particular | Transaction No. | Dr | Cr | Balance`।
- **Credit Limit Summary**: Net Outstanding (Cr), Unsettled Order Balance (অপূর্ণ PO), Net Outstanding (Considering Unsettled Order Value), Credit Allowed Days।

### 15.7 Outstanding রিপোর্ট (Reports › Outstanding)
**ধরন ১: Outstanding** (একটা নির্দিষ্ট তারিখের ব্যালেন্স):
- Customer Outstanding Detail
- Group Wise Outstanding Detail
- Outstanding Detail (কাস্টমার আর সাপ্লায়ার দুটোই)
- SalesPerson Wise Outstanding Detail
- SalesPerson Wise Outstanding Summary
- Supplier Outstanding Detail
- ইনপুট: As On, Group, একাধিক Sales Person, Customer বা Supplier, Currency, **Net Outstanding** টগল, আর Geo বা Distribution ফিল্টার (feature চালু থাকলে)।

**ধরন ২: Transactional Outstanding** (তারিখের রেঞ্জ ধরে চলাচল):
- Customer Transactional Outstanding, Supplier Transactional Outstanding, Transactional Outstanding (দুটোই)।
- কাঠামো: Sales Person অনুযায়ী গ্রুপ। কলাম: `Customer | Opening Balance | Total Debited | Total Credited | Closing Balance`। Sales Person-এর subtotal আর মোট।
- দুটো ভাগ: **"Receivable from Customer"** আর **"Payable to Customer"** (যাদের ব্যালেন্স Cr, যেমন অগ্রিম দিয়েছে)।

**ধরন ৩: Transactional Outstanding Detail**: প্রতিটা লেনদেনসহ বিস্তারিত।

### 15.8 Outstanding Aging (Reports › Outstanding › Aging)
- Customer অথবা Supplier।
- **Calculated On**:
  - `L` Ledger Balance: মোট ledger ব্যালেন্স ধরে
  - `N` Net Outstanding: শুধু যেসব বিল settle হয়নি সেগুলো ধরে, বিলের তারিখ থেকে বয়স গোনা হয় [অনুমান]
- As On তারিখ, Group, Sales Person (একাধিক), Customer বা Supplier, Currency।
- **Range ইউজার নিজে ঠিক করে**: "Range Upper Limit" দিয়ে Add করলে Lower/Upper বালতি তৈরি হয় (যেমন ৩০, ৬০, ৯০, ১২০ দিন)। এগুলো JSON হিসেবে সার্ভারে যায় (`rangeLists`)।

### 15.9 Bill-wise Settlement (কোন টাকা কোন বিলের বিপরীতে)
Oner দুটো আলাদা ব্যালেন্স রাখে:
- **Ledger Balance**: সব Dr − Cr, চলমান যোগফল।
- **Net Outstanding**: বিল অনুযায়ী, কোন ইনভয়েসের কত টাকা এখনো বাকি।

দুটোকে মেলানোর তিনটা উপায়:
1. **এন্ট্রির সময় mapping**:
   - Collection-এ `CollectionAgainst` হলো `Adv` (অগ্রিম), `Pre` (পুরনো বকেয়া বা opening), `SO` (Sales Order) অথবা `Inv` (Invoice/Bill)। তারপর গ্রিডে প্রতিটা ইনভয়েসের Collected, Remaining আর Given Amount দেখায়, auto-mapping হয়, চাইলে হাতে বদলানো যায়।
   - Payment-এ `PaymentAgainst` হলো `Adv`, `Pre`, `PO`, `Bill` (Receive Finalize) অথবা `LC`।
2. **পরে Settlement**: Accounts & Finance › Party Transaction Settlement (কাস্টমার)
   - **Settle By**: `COL` (Collection) অথবা `SR` (Sales Return)। **Settle To**: `INV` (Invoice/Bill)।
   - বাম দিকে আদায় বা রিটার্নের তালিকা (Date, Sales Person, Mode, Amount, Settled, Remaining, Current Settlement)। ডান দিকে ইনভয়েসের তালিকা (Invoice No, Amount, Collected, Remaining, Given Amount)।
   - বাছাই করলে মোট টাকা **পুরনো থেকে নতুন ক্রমে (FIFO)** ইনভয়েসগুলোতে নিজে থেকে ভাগ হয়। কোনো ইনভয়েসে Remaining-এর বেশি যায় না, চাইলে হাতে বদলানো যায়।
   - **দুই পাশের মোট সমান না হলে Save হয় না।**
   - Save করলে পাঠানো হয় `{SettleByLists, SettleToLists, Currency, TranSettleBy, TranSettleTo}`।
3. **Payment Settlement** (সাপ্লায়ার): Payment-কে Receive Finalize (বিল)-এর সাথে একই নিয়মে মেলানো হয়।

> **againERP-তে অবস্থা:** Settlement আর Settled by বানানো হয়েছে। দেখুন §19.2।

সংশ্লিষ্ট পেজ: **Invoice Wise Pending Collection**। লোকেশন আর তারিখ অনুযায়ী প্রতিটা ইনভয়েসের Status, Amount, Discount, Duty, Charge, Total আর Settled By দেখায়।

### 15.10 অন্যান্য ledger-সংক্রান্ত রিপোর্ট
- **Collection Analysis**:
  - Grouping আর column বাছাই করা যায়।
  - তুলনা করা যায় বছর বা মাস অনুযায়ী: আগের বছর বা মাসের সাথে, অথবা নির্দিষ্ট বছর বা মাসের সাথে।
  - ফিল্টার: Sales Person, Collected By, Collection Against, Mode, Group, Customer, আর Status (Approved, Unapproved, Cancelled)।
- **Payment Analysis**: একই ধরনের, Payment Against, Mode আর Payment By দিয়ে।
- **Sales & Collection Analysis**: বিক্রি বনাম আদায়, Sales Mode আর Sales Person অনুযায়ী।
- **Party Adjustment** (+Analysis): Adjustment For (Customer বা Supplier), Nature, Type, Status।
- **Accounts Ledger**: GL হেডের ledger, যেমন Accounts Receivables-এর মোট। With Detail, With Reference আর Ref. Hyperlink অপশন আছে।

### 15.11 [againERP] ডিজাইন প্রস্তাব
```
parties(id, code, name, party_type ENUM('customer','supplier','both'),   -- Combined সমস্যার সহজ সমাধান
        customer_kind ENUM('customer','buyer'), supplier_kind ENUM('local','foreign'),
        trade_mode ENUM('cash','credit','both'), is_walk_in, currency, control_account_id NULL,
        credit_limit, ledger_limit, conditional_limit, conditional_valid_till, security_money,
        credit_days, is_locked, is_rma_locked, sales_person_id, group_id, grade_id, ...)

party_opening_balances(party_id, location_id, as_of_date, amount, dr_cr,
                       cheque_dishonour_amount, currency, fx_rate, is_finalized)

party_ledger_entries(                       -- ডকুমেন্ট approve হলে তৈরি, cancel হলে উল্টো এন্ট্রি
   id, party_id, party_role ENUM('customer','supplier'),
   entry_date, doc_type ENUM('opening','sales','collection','sales_return','damage_return',
                             'cheque_dishonour','refund','purchase','payment','purchase_return',
                             'party_adjustment','debit_note','credit_note','rma_charge'),
   doc_id, doc_no, particular, dr, cr, currency, fx_rate, base_dr, base_cr,
   location_id, sales_person_id, voucher_id, created_at)
   INDEX(party_id, entry_date)

bill_allocations(                           -- Settlement বা mapping
   id, party_id, from_doc_type, from_doc_id,          -- collection / payment / return / advance
   to_doc_type, to_doc_id,                           -- invoice / receive_finalize / sales_order / po
   amount, allocated_at, allocated_by, source ENUM('entry_mapping','settlement','auto_fifo'))

posting_rules(doc_type, line_role, account_id)      -- যেমন sales → Dr AR control / Cr Sales
```
**নিয়ম আর হিসাব:**
- Running balance: `SUM(dr - cr) OVER (PARTITION BY party_id ORDER BY entry_date, id)`।
- Net Outstanding: প্রতিটা বিলের amount − যোগফল(allocations)। Aging বালতি হবে বিলের তারিখ বা due date (তারিখ + credit_days) থেকে।
- Credit check (Sales Order বা Invoice approve-এর সময়): `ledger_balance + unsettled_order_value + এই ডকুমেন্ট ≤ credit_limit` (অথবা ValidTill পর্যন্ত conditional_limit)। এছাড়া IsLocked আর trade_mode=cash চেক।
- নিয়ন্ত্রণ চেক: সব কাস্টমারের ledger-এর যোগফল = AR control-এর GL ব্যালেন্স। মাসিক reconciliation রিপোর্ট রাখুন। Oner-এ এমন রিপোর্ট চোখে পড়েনি।

**Oner-এর চেয়ে ভালো করার সুযোগ:**
- Combined পার্টির জন্য একটাই `parties` টেবিল, আর একটা ledger রিপোর্টে কাস্টমার আর সাপ্লায়ার দুই দিকের হিসাব (net)।
- Settlement-এ auto-FIFO আর হাতে বদলানো দুটোই রাখা, সাথে "un-settle" করার সুবিধা।
- ledger-এর পাশাপাশি পার্টির বর্তমান ব্যালেন্সের একটা আলাদা টেবিল রাখা, যাতে বিক্রির সময় credit check দ্রুত হয়।
- পার্টি পোর্টাল বা SMS-এ ledger বা statement পাঠানো (Oner-এ Bulk SMS আছে, কিন্তু statement পাঠানোর ব্যবস্থা দেখা যায়নি)।

---

## 16. Finance আর Accounts: কীভাবে হিসাব রাখা হচ্ছে [২৮ অক্টোবর ২০২৬]

> পদ্ধতি: Chart of Accounts-এর সব স্তর, Cash/Bank Identification, ভাউচারের সব ধরন আর সংখ্যা পড়া হয়েছে। প্রতিটা ধরনের Auto ভাউচারের নমুনা খুলে **শুধু হেডের নাম আর Dr/Cr দিক** নেওয়া হয়েছে, টাকার অঙ্ক বা পার্টির নাম নয়। Closing ভাউচার আর আর্থিক রিপোর্টের অপশনও দেখা হয়েছে। Posting, Accounts Closing, Fund Transfer, Security Instrument আর Project এই ইউজারের জন্য বন্ধ।

### 16.1 সারসংক্ষেপ (মূল পর্যবেক্ষণ)
1. **প্রায় সব হিসাব নিজে থেকে তৈরি হয়।** মোট ভাউচারের ~৯৮% (৭৮,৮২৯টা) হলো `AUT` (Auto), যা বিক্রি, কেনা, আদায়, পেমেন্ট আর চেক থেকে তৈরি হয়। হাতে দেওয়া ভাউচার খুব কম।
2. **প্রতিটা Auto ভাউচারে মাত্র ২ লাইন** (একটা Dr, একটা Cr)। ডিসকাউন্ট, ডিউটি বা COGS-এর আলাদা লাইন নমুনায় দেখা যায়নি।
3. **Inventory হিসাব periodic পদ্ধতিতে চলে।** কেনা মাল সরাসরি "Purchase" খরচে যায়। বিক্রিতে Cost of Sales বা Stock-এর কোনো এন্ট্রি হয় না। শেষ মজুদ শুধু Closing ভাউচারে বসানো হয়।
4. **Year-end Closing একবারই হয়েছে, জানুয়ারি ২০২৩-এ।** তারপর থেকে আর Closing হয়নি।
5. **Opening balance** ১৩৪টা হেডের একটাও "Finalized" নয়।
6. Credit Voucher আর Journal Voucher **একবারও ব্যবহার হয়নি**। হাতে দেওয়া খরচ সব Debit Voucher-এ, আর ব্যাংকে ক্যাশ জমা সব Contra-তে।

### 16.2 Chart of Accounts-এর গঠন [দেখা]
**৫ স্তর**: `Group → Sub-Group → Control → Subsidiary → Accounts (Ledger)`। লেনদেন শুধু শেষ স্তরে (Ledger) হয়।
- **FullCode**: ১৪ অঙ্কের, যেমন `1 001 005 013 0056`। [অনুমান: Group ১ অঙ্ক, Sub-Group ৩, Control ৩, Subsidiary ৩, Ledger ৪]
- **BalanceType** Group অনুযায়ী ঠিক হয়: Assets আর Expenses হলো Dr, Liabilities, Equity আর Revenue হলো Cr।
- **Categorization**: প্রতিটা Ledger-এ একটা Categorization থাকে, যেটা আর্থিক রিপোর্টের লাইন ঠিক করে। কোন Group-এ কোন Categorization চলে:

| Group | Categorization (রিপোর্টের লাইন) |
|---|---|
| Assets | Short Term Assets/Current Assets, Long Term Assets/Fixed Assets, **Inventory** |
| Expenses | Operating Expenses, Non-Operating Expenses, **Purchase**, Import, Trade Discount (Sales), **Sales Return**, **Cost of Sales**, Business Tax |
| Liabilities | Short Term Liabilities, Long Term Liabilities |
| Owners Equity | Capital, Retained Earnings |
| Revenue | **Sales Revenue**, **Purchase Return**, Trade Discount (Purchase), Others Revenue |

- **Ledger-এ যা থাকে**: Group/SubGroup/Control/Subsidiary Id, Code, FullCode, AccountsName, CategorizationId, Currency, ExchangeRate, OpeningBalance, OpeningDate, **LocationWiseOpeningLists** (লোকেশন অনুযায়ী opening), IsOpeningBalanceFinalized, BalanceType, IsEditable।
- **বর্তমান tree** (নাম সংক্ষেপে, ব্যক্তিগত নাম বাদ দিয়ে):
```
Assets (27 ledger)
  Current Assets
    Cash & Cash Equivalent (16): Cash In Hand [Cash Head Office, শাখার Cash, Bkash, Rocket], Cash At Bank [৬টা ব্যাংক অ্যাকাউন্ট],
                                 Cheque In Hand, Transit Cheque In Hand, Vat & Tax [VAT/Tax Deduction at source], Security deposit
    Advance (Office Advance), Receivable (Accounts Receivables, Acc Receivable RMA, RMA Replacement)
    Inventory (6): Current Stock, BAD Stock, RMA Stock, LIM Stock, Transit Stock, Asset Consumable Item
  Fixed Assets: Furniture
Expenses (81)
  Operating Expenses: Office Expenses (31), Operating expenses (30), Home Expenses (7), Loan Expenses (5)
  Non Operating: Adjustment Expense, Adjustment Expenses RMA, Amortization, Bad Debts, Depreciation, Interest
  Purchase: Purchase      Sales Return: Sales Return
Liabilities (11)
  Short Term → Payable: Accounts Payable, Foriegn Payables, Acc Payable RMA, Advanced Cheque Issue, Commissions Payable,
                         Govt Duty, Govt Duty Exempted, RMA Complain, Sales Delivery Charge, Salary Payable ...
Owners Equity (4): Capital From Owner, Retained Earnings, Retaining Earning, Stock Adjustment
Revenue (11): Sales, Product Spare, ProductService, RMA Service Sales, Purchase Return, Adjustment Revenue (+RMA),
              Gain on Sale of Assets, Interest Income, Other Revenue
```

### 16.3 বিশেষ হেড চিহ্নিতকরণ (Setup › Accounts › Cash / Bank Identification) [দেখা]
সিস্টেম কিছু হেডকে বিশেষ ভূমিকা হিসেবে চেনে। ভাউচার ফর্মের ড্রপডাউন এগুলো থেকেই আসে, যেমন Debit ভাউচারের "Credited From" শুধু Cash বা Bank হেড দেখায়।

| ভূমিকা | কোন স্তরে চিহ্নিত হয় | এখনকার সেটিং |
|---|---|---|
| **Cash** | Control বা Subsidiary, সাথে "Check Balance" (ঋণাত্মক হতে দেবে না) | Subsidiary "Cash In Hand", Check Balance = **No** |
| **Bank** | Control বা Subsidiary | Subsidiary "Cash At Bank" |
| **Cheque In Hand** | Subsidiary বা Accounts | **খালি** (কোনো হেড চিহ্নিত নেই) |
| **Adv. Cheque Issue** | Subsidiary বা Accounts | Accounts "Advanced Cheque Issue" |
| **Bank Clearing House** | Subsidiary বা Accounts | খালি |
| **Transit Head for Fund Transfer** | Subsidiary বা Accounts | খালি |

**[againERP]** `account_roles(role ENUM('cash','bank','cheque_in_hand','adv_cheque_issue','clearing_house','fund_transit','ar_control','ap_control',...), level, ref_id, check_balance)`।

### 16.4 ভাউচারের ধরন আর ব্যবহার [দেখা]
| কোড | ধরন | সংখ্যা | কীভাবে ব্যবহার হচ্ছে |
|---|---|---|---|
| `DV` | Debit / Payment | ১,০২৮ | মাসিক খরচ (ভাড়া, বিল, বেতন, লোনের কিস্তি…)। বিবরণ "<খরচের নাম> <মাস>" ধাঁচের। |
| `CV` | Credit / Receive | ০ | ব্যবহার হয় না |
| `CON` | Contra | ৬৮৩ | প্রায় সব "BRAC BANK CASH DEPOSIT", অর্থাৎ দোকানের ক্যাশ ব্যাংকে জমা |
| `JV` | Journal | ০ | ব্যবহার হয় না |
| `AUT` | Auto | ৭৮,৮২৯ | লেনদেন থেকে নিজে তৈরি (§16.6) |
| `CLO` | Closing | ১ | ২২ জানুয়ারি ২০২৩ পর্যন্ত Closing |

**Operational Event** (Voucher Analysis-এ auto ভাউচারের উৎস ধরে ছাঁকার জন্য): Adjustment, AssetManagement, ChequeTreatmentCollection, ChequeTreatmentPayment, Import, Production, Purchase, RMA, Sales, Transfer, Voucher।

### 16.5 হাতে দেওয়া ভাউচারের ফর্ম [দেখা]
**সবগুলোর জন্য কমন**: Currency, Voucher No (সার্ভার তৈরি করে), Date, Voucher Desc.। প্রতিটা লাইনে Accounts Head, **Project**, Particular, Amount। মাল্টি-কারেন্সির জন্য লাইনে `Debit/Credit`, `Currency1Debit/Credit` আর `Currency2Debit/Credit` থাকে (base আর বিকল্প কারেন্সিতে)।

- **Debit (Payment)**:
  - "Credited From": একটা Cash বা Bank হেড (একটা)। নিচে একাধিক Dr লাইন: Cash/Bank বাদে যেকোনো হেড।
  - **Cheque Issue** টিক দিলে Bank, অব্যবহৃত চেকের পাতা আর Cheque Date লাগে।
  - **Auto Honor** চালু থাকলে Cr যায় সরাসরি Bank-এ, বন্ধ থাকলে "Advanced Cheque Issue"-এ।
  - OperationType: `CC` (Cash) বা `BC` (Bank)।
- **Credit (Receive)**: "Debited To" (Cash বা Bank), একাধিক Cr লাইন। **Cheque Receive** টিক দিলে কাস্টমারের ব্যাংক, চেক নম্বর আর Deposited Bank লাগে। Auto Honor না থাকলে টাকা "Cheque In Hand"-এ থাকে।
- **Contra** (Cash ↔ Bank, Bank ↔ Bank):
  - **Instant**: সাথে সাথে।
  - **Eventual**: Cr হয় "Credited From"-এ, তারপর **Transit A/C**, আর জমার তারিখে Dr হয় নির্দিষ্ট হেডে। সাথে Trx No, Credited Date আর Deposited Date।
  - Issued Cheque দিয়েও Contra করা যায়।
- **Journal**: যেকোনো হেডে Dr আর Cr, দুই পাশ সমান হতে হবে।
- **Voucher Template** (Setup › Template › Voucher): বারবার একই ভাউচার দিতে হলে আগে থেকে template বানিয়ে রাখা যায় (Header, Detail, Dr/Cr লাইন)। "Voucher From Template" থেকে ভাউচার দেওয়া যায়।

> **againERP-তে অবস্থা:** Debit, Credit, Contra, Journal আর Voucher Template বানানো হয়েছে। দেখুন §19.2।

**জীবনচক্র**: Entry → (Edit, যদি approve না হয়ে থাকে) → **Approve › Voucher** (ধরন অনুযায়ী তালিকা; একটা একটা বা **Bulk**; পাসওয়ার্ড feature থাকলে পাসওয়ার্ড) → **Posting** (Posted ফ্ল্যাগ) → **Cancel › Voucher** (পাসওয়ার্ড আর কারণ)। Edit তালিকায় Status আর Posted কলাম দেখায়। নমুনার সব ভাউচার Approved আর Posted ছিল। [অনুমান: Auto ভাউচার approve হওয়ার সাথে সাথে post হয়ে যায়]

**উৎস ডকুমেন্টের সাথে লিংক**: ভাউচারে `ReferenceNo`, `ReferenceId`, `ReferenceTag` (যেমন "Sales Invoice", "Collection", "Payment", "Purchase", "Purchase Return", "Sales Return", "Party Adjustment") আর `IsAutoVoucher` থাকে। ফলে ledger রিপোর্টে "With Reference" বা "Hyperlink" দিয়ে মূল ডকুমেন্টে যাওয়া যায়। Cheque Treatment-এর ভাউচারে ReferenceTag ফাঁকা থাকে।

### 16.6 Auto-posting rules (নমুনা ভাউচার থেকে দেখা) [দেখা]
| লেনদেন (ReferenceTag) | Dr | Cr | মন্তব্য |
|---|---|---|---|
| **Sales Invoice** (নগদ বা বাকি) | Accounts Receivables | **Sales** | নগদ বিক্রিও AR দিয়ে যায়, সাথে আলাদা Collection ভাউচার |
| Sales Invoice (RMA বা Spare বিক্রি) | Accounts Receivables | **Product Spare** | প্রোডাক্টের ধরন অনুযায়ী আয়ের হেড আলাদা |
| **Collection** (Cash) | Cash Head Office | Accounts Receivables | |
| Collection (Bkash) | Bkash | Accounts Receivables | মোবাইল ব্যাংকিং আলাদা Cash হেড |
| Collection (Cheque, auto honor নয়) | Cheque In Hand | Accounts Receivables | [অনুমান, নমুনায় পাওয়া যায়নি] |
| Collection Cheque **Send** | Transit Cheque In Hand | Cheque In Hand | |
| Collection Cheque **Honour** | Bank | Transit Cheque In Hand | |
| **Sales Return** | Sales Return (খরচ) | Accounts Receivables | |
| **Party Adjustment** (কাস্টমার) | Adjustment Expense | Accounts Receivables | Nature অনুযায়ী উল্টোও হতে পারে (Adjustment Revenue) |
| **Purchase** | **Purchase** (খরচ) | Accounts Payable | মাল Inventory-তে যায় না |
| **Purchase Return** | Accounts Payable | Purchase Return (আয়) | |
| **Payment** Cash | Accounts Payable | Cash Head Office | |
| Payment TT বা Online | Accounts Payable | Bank | |
| Payment **Cheque** | Accounts Payable | Advanced Cheque Issue | |
| Payment Cheque **Send** | Advanced Cheque Issue | Bank | ব্যাংকে পাঠালেই Bank Cr হয়ে যায় |
| Payment Cheque **Dishonor** | Bank | Advanced Cheque Issue | Send-এর উল্টো |
| Payment Cheque **BalanceAdjusted** | Advanced Cheque Issue | Accounts Payable | পেমেন্টটাই উল্টে যায়, সাপ্লায়ার আবার পাওনাদার |
| Payment Cheque **Honor** | (কোনো ভাউচার নেই) | | Send-এর সময়েই Bank Cr হয়েছে [অনুমান] |
| Contra (Cash Deposit) | Bank | Cash Head Office | হাতে দেওয়া |

> **§11.7-এর সংশোধন**: আগে অনুমান করা হয়েছিল ইস্যু করা চেক Honor হলে Bank Cr হয়। আসলে **Send** করার সময়েই Bank Cr হয়ে যায়। Received cheque-এর জন্য মাঝে একটা "Transit Cheque In Hand" ধাপ আছে।

**এখনো যাচাই হয়নি**: ডিসকাউন্ট (Trade Discount হেড আছে), Govt Duty (Govt Duty liability হেড আছে), Delivery Charge, Commission Payable, Stock Adjustment, Transfer, RMA Complain বা Replacement, Import Costing-এর Auto ভাউচার। নমুনায় এগুলো আলাদা লাইনে আসেনি। [অনুমান: হয় net হিসাব হয়, নয়তো এই কোম্পানিতে ব্যবহার কম]

### 16.7 Inventory অ্যাকাউন্টিং: Periodic পদ্ধতি [দেখা + অনুমান]
- কেনা মাল যায় **Dr Purchase (খরচ)**-এ, বিক্রি যায় **Cr Sales**-এ। Inventory বা COGS-এর কোনো এন্ট্রি নেই।
- **Closing ভাউচার** (একমাত্র, জানুয়ারি ২০২৩) মাত্র ৪ লাইনের: `Current Stock Dr / Stock Adjustment Cr` (শেষ মজুদ বসানো) আর `Sales Dr / Retained Earnings Cr` (আয় Retained Earnings-এ সরানো)।
- অর্থাৎ Gross Profit = Sales − (Opening Stock + Purchase − Closing Stock)। এটা আর্থিক রিপোর্টে হয়, আর **Gross Profit Analysis** রিপোর্ট প্রোডাক্টের cost আলাদাভাবে হিসাব করে।
- স্টকের ধরন অনুযায়ী Inventory হেড (Current, BAD, RMA, LIM, Transit) তৈরি আছে, কিন্তু নিয়মিত লেনদেনে ব্যবহার হতে দেখা যায়নি।

### 16.8 আর্থিক রিপোর্ট [দেখা]
| রিপোর্ট | অপশন |
|---|---|
| **Trial Balance** | ধরন: `TB` (ব্যালেন্স) অথবা `TTB` (Transactional, অর্থাৎ Opening, Dr, Cr, Closing)। স্তর: Accounts, Subsidiary, Control বা Sub-Group অনুযায়ী। With Hierarchy (Grouping বা Column), Skip Zero। ফিল্টার: Group থেকে Subsidiary পর্যন্ত, Categorization, Location। |
| **Income Statement** | Control, Subsidiary বা Accounts অনুযায়ী। তারিখের রেঞ্জ, Location (`LocationWiseAccountsBalance` feature চালু থাকলে), Skip Zero, Currency। |
| **Balance Sheet** | As On তারিখ। Control, Subsidiary বা Accounts অনুযায়ী। With Hierarchy, Skip Zero। |
| **Receive & Payment** | Location, তারিখের রেঞ্জ, With Detail। Cash আর Bank হেডের আসা-যাওয়া। |
| **Day Book** | Detail অথবা Summary, Location, তারিখের রেঞ্জ, Hyperlink। |
| **Accounts Ledger** | যেকোনো স্তর (Group থেকে Ledger), Location, তারিখের রেঞ্জ, With Detail, With Reference, Ref. Hyperlink। |
| **Accounts Analysis** | `Ending_Balance` অথবা `Transaction_Analysis`। সময়কাল: মাসিক, ত্রৈমাসিক, অর্ধবার্ষিক, বার্ষিক। আরেকটা তারিখের সাথে তুলনা, "Show both sided transaction"। |
| **Voucher** | ভাউচারের ধরন আর তারিখ অনুযায়ী তালিকা। Status, Entry By আর Posted দেখায়। With Reference বা Hyperlink। |
| **Voucher Analysis** | Date Wise Voucher (+Detail)। ফিল্টার: Location, Voucher Type, Event, Voucher For, A/C Head, Voucher No, আর Status (Approved, UnApproved, Cancelled)। |

সব রিপোর্ট PDF, Excel বা Word-এ বের করা যায়। লোকেশন ড্রপডাউনে শুধু যেসব লোকেশনে ইউজারের Report Access আছে সেগুলো আসে।

### 16.9 সমস্যা আর ঝুঁকি (এই কোম্পানির ব্যবহারে) [দেখা]
1. **২০২৩ সালের পর কোনো Closing হয়নি।** ফলে Income Statement আর Retained Earnings বছর অনুযায়ী আলাদা হচ্ছে না, আর শেষ মজুদ বাস্তবের সাথে মিলছে না।
2. **ভুল Categorization**: Bkash আর Rocket (নগদ বা মোবাইল ওয়ালেট) "Long Term Assets/Fixed Assets"-এ রাখা। Balance Sheet-এ এগুলো ভুল জায়গায় দেখাবে।
3. **"Stock Adjustment" হেড রাখা আছে Capital-এ।** মজুদের সমন্বয় তাই মালিকের মূলধনে যাচ্ছে।
4. **Cheque In Hand-এর Identification ফাঁকা।** Credit ভাউচারের চেক অংশ ঠিকমতো কাজ নাও করতে পারে।
5. **Cash হেডে "Check Balance" বন্ধ।** ফলে ক্যাশ ঋণাত্মক হতে পারে।
6. **Opening balance কোনোটা Finalized নয়।** যে কেউ পরে বদলে ফেলতে পারে।
7. **ব্যবসার বাইরের, পারিবারিক বা ব্যক্তিগত খরচও কোম্পানির খরচের হেডে** (Home Expenses, Loan Expenses-এর অনেক হেড)। হিসাবের মান আর ট্যাক্সের দিক থেকে এগুলো আলাদা রাখা ভালো (যেমন Owner's Drawings)।
8. Credit বা Journal ভাউচার ব্যবহার না হওয়ায় accrual (বকেয়া খরচ বা আয়) আর সংশোধনী এন্ট্রি হচ্ছে না।

### 16.10 [againERP] ডিজাইন প্রস্তাব
```
account_groups(id, code, name, nature ENUM('asset','liability','equity','income','expense'), normal_balance ENUM('dr','cr'))
accounts(id, parent_id, level TINYINT /*1..5*/, code, full_code, name, group_id,
         categorization_id, currency, is_postable /*শুধু leaf*/, is_active, is_editable)
account_categorizations(id, group_id, name, statement ENUM('BS','IS'), section, sort_order)   -- রিপোর্টের লাইন
account_roles(role, account_id NULL, level_ref, check_balance)                           -- §16.3
account_opening_balances(account_id, location_id, fiscal_year_id, dr, cr, currency, fx, is_finalized, finalized_by, finalized_at)

fiscal_years(id, start_date, end_date, status ENUM('open','closing','closed'))
fiscal_periods(id, fiscal_year_id, month, is_locked)          -- লক করা মাসে back-date এন্ট্রি দেওয়া যাবে না

vouchers(id, voucher_no, type ENUM('DV','CV','CON','JV','AUT','CLO','OPN'), date, description, currency, fx_rate,
         status ENUM('draft','pending','approved','cancelled'), is_posted, posted_at,
         source_type, source_id, source_no, event /*Sales, Purchase, ChequeTreatmentPayment…*/, location_id,
         entry_by, approved_by, approved_at, cancel_reason)
voucher_lines(id, voucher_id, account_id, project_id NULL, party_type NULL, party_id NULL,
              particulars, dr, cr, base_dr, base_cr, bank_account_id NULL, cheque_id NULL, cost_center_id NULL)
  -- CHECK: প্রতিটা ভাউচারে SUM(base_dr) = SUM(base_cr)

posting_rules(event, sub_event, line_role ENUM('debit','credit'), amount_source /*total,net,discount,duty,cogs…*/,
              account_resolver /*fixed:ID | party_control | product.sales_account | payment_mode.account …*/)
```
**নীতি:**
- **Event-driven posting**: প্রতিটা ডকুমেন্ট approve হলে `posting_rules` থেকে ভাউচার তৈরি হবে। Cancel হলে উল্টো ভাউচার (reversal) তৈরি হবে, মূল ভাউচার মোছা হবে না।
- **ভাউচারে আলাদা লাইন রাখুন**: Oner একটা লেনদেনের সব কিছু ২ লাইনে net করে। againERP-তে Gross Sales, Discount, VAT Payable, Delivery Charge আলাদা লাইনে রাখুন, তাহলে VAT রিটার্ন আর ডিসকাউন্ট বিশ্লেষণ সরাসরি GL থেকে করা যাবে।
- **Perpetual বনাম Periodic**: feature flag রাখুন। ডিফল্ট হোক **perpetual**: বিক্রির সময় `Dr COGS / Cr Inventory (stock type অনুযায়ী)`, কেনার সময় `Dr Inventory / Cr AP`। Moving average cost ধরে হিসাব করুন। তাহলে মাসিক লাভ-ক্ষতি সঠিক হবে, আর Closing-এ মজুদ বসাতে হবে না।
- **Year-end close wizard**: ধাপে ধাপে বছর বন্ধ করা। শুরুতে চেক (approve না হওয়া ভাউচার, চেক Not Treated, opening finalize হয়নি), তারপর Income আর Expense শূন্য করে Retained Earnings-এ সরানো, পরের বছরের opening তৈরি, আর মাস বা বছর লক।
- **Cheque রোল §16.6 অনুযায়ী**: issued চেকে Send-এর সময় Bank Cr। received চেকে Send-এর সময় Transit, Honor হলে Bank।
- **রিপোর্ট**: TB, TTB, IS, BS, Receive-Payment, Day Book, Ledger, Analysis (মাস, ত্রৈমাসিক, বছর আর তুলনা), সব হিসাব `voucher_lines` থেকে। হিসাব দ্রুত করার জন্য মাসিক ব্যালেন্সের সংক্ষিপ্ত টেবিল (`account_period_balances`) রাখুন।
- **নিয়ন্ত্রণ**: Cash হেডে ঋণাত্মক ব্যালেন্স আটকানো, AR/AP control-এর সাথে party ledger মিলিয়ে দেখার রিপোর্ট (§15.11), আর Bank Reconciliation (Oner-এ এটা দেখা যায়নি)।

---

## 17. Approval সিস্টেম: কীভাবে কাজ করে [২৮ অক্টোবর ২০২৬]

> পদ্ধতি: Approve (১৯টা খোলা) আর Cancel (১৯টা খোলা) পেজের লজিক, নোটিফিকেশন বেলের সার্ভিস আর approval-সংক্রান্ত feature flag পড়া হয়েছে। কোনো কিছু approve বা cancel করা হয়নি। বাকি ৭৪টা Approve/Cancel পেজ এই ইউজারের জন্য বন্ধ, তবে মেনু আর নোটিফিকেশনের তালিকা থেকে বোঝা যায় সেগুলোও একই নকশায় বানানো।

### 17.1 মূল ধারণা [দেখা]
- **সব লেনদেন approve হওয়ার জন্য অপেক্ষা করে।** এন্ট্রি দেওয়া (Task) আর approve করা (Approve) সবসময় আলাদা ধাপ, কে এন্ট্রি দিচ্ছে তাতে কিছু বদলায় না। এমনকি Administrator দিলেও ডকুমেন্টটা pending থাকে। পরে Approve মেনু থেকে approve করতে হয়। [অনুমান: Task ফর্মে কোনো "সরাসরি approve" অপশন দেখা যায়নি]
- **কে approve করতে পারবে**, সেটা শুধু Menu Permission ঠিক করে: যার `Approve › <ডকুমেন্ট>` পেজের অনুমতি আছে (§3)। মডিউল-স্তরের আলাদা "Approve right" নেই, প্রতিটা ডকুমেন্টের ধরনের জন্য আলাদা মেনু কোড।
- **স্তর একটাই।** এক ধাপে approve, কোনো ক্রমানুসারী (multi-level) বা টাকার সীমা অনুযায়ী (amount threshold) approval নেই। ব্যতিক্রম শুধু HR-এর **Leave Application**: সেখানে আগে **Reliever** (বদলি কর্মী) approve করে, তারপর ঊর্ধ্বতন।
- **Reject বলে আলাদা কিছু নেই।** pending ডকুমেন্ট বাতিল করা হয় **Cancel** মেনু থেকে, **কারণ লেখা বাধ্যতামূলক**। "Return for correction" নেই; সংশোধন করতে হলে **Edit (Before Approval)** মেনু দিয়ে নিজেই বদলাতে হয়।
- **Approve হওয়ার পরের অবস্থা** সব ডকুমেন্টে এক নয়:
  - কিছু ডকুমেন্টের **Edit After Approval** আছে: Purchase, Purchase Order, Sales Order, Sales Invoice, Import Costing।
  - কিছু ডকুমেন্টের **Cancel After Approval** আছে: Sales Order।
  - বাকিগুলো approve হলে চূড়ান্ত। ভুল হলে Return, Adjustment বা Note দিয়ে ঠিক করতে হয়।

### 17.2 Approve পেজের গঠন (সব ডকুমেন্টে একই) [দেখা]
```
[ফিল্টার: Location (report-access লোকেশন), Currency, Date From–To, ডকুমেন্ট নম্বর দিয়ে খোঁজা]
[Pending তালিকা: Date | No. | Party | Mode/Type | Entry By | Amount | (☐ Bulk) | 👁 Detail | 🖨 Print | ✔ Approve]
  └─ Detail popup: পুরো ডকুমেন্ট আর লাইনগুলো (approve-এর আগে মিলিয়ে দেখার জন্য)
  └─ Print: approve-এর আগেই PDF বের করা যায় (paper size, header, POS format…)
[Bulk Approve বোতাম + নির্বাচিতগুলোর সংখ্যা আর মোট টাকা]   ← শুধু Sales Invoice, Collection, Payment, Voucher-এ
```
**Approve চাপলে ধাপগুলো** (প্রতিটা Approve পেজে একই কোড):
1. **Self-approval চেক**: তালিকার প্রতিটা সারিতে `IsSameAsEntryBy` থাকে (সার্ভার হিসাব করে দেয়)। Feature `EntryByApproveCancel` = false হলে আর ইউজারই এন্ট্রিকারী হলে দেখায় *"You have no authority to approve this."*। এখন এই feature **true**, অর্থাৎ নিজের এন্ট্রি নিজে approve করা যায়।
2. **পাসওয়ার্ড চেক**: Feature `CheckPassword` = true হলে একটা পাসওয়ার্ডের popup আসে, আর সার্ভারে ইউজারের পাসওয়ার্ড যাচাই হয়। এখন এটা **false**।
3. **নিশ্চিতকরণ**: *"Are you sure you want to approve invoice no. X?"* অথবা bulk হলে *"…approve N selected invoice?"* → Yes চাপলে approve।
4. **API**: `POST /api/TE0xx` (ডকুমেন্ট অনুযায়ী আলাদা endpoint)। Bulk হলে body-তে id-র তালিকা যায় (`salesInvoiceIds`, `collectionIds`, `paymentIds`, `voucherIds`)।
5. সফল হলে নোটিফিকেশনের cache মুছে ফেলা হয় (`localStorage.notificationInfo`), যাতে বেলের সংখ্যা আবার নতুন করে আসে।

**Approve হলে যা ঘটে [অনুমান, সার্ভার-সাইড]**:
- স্টক আর party ledger-এ এন্ট্রি হয়।
- Auto voucher তৈরি হয় (`AUT`, Approved, Posted, §16)।
- ডকুমেন্টটা পরের ধাপের ফর্মে দেখা দেয়, যেমন approve হওয়া Sales Order-ই Delivery Challan ফর্মে আসে।

### 17.3 Cancel পেজের গঠন [দেখা]
- Approve পেজের মতোই একই pending তালিকা দেখায়। অর্থাৎ Cancel মানে আসলে **approve-এর আগে বাতিল করা**।
- Cancel চাপলে আগের মতোই self-approval আর পাসওয়ার্ড চেক হয়। তারপর একটা popup-এ *"Are you sure you want to cancel payment no. X"* আর একটা **Reason** ঘর আসে। Reason না লিখলে Yes বোতাম বন্ধ থাকে।
- API: `POST /api/TE0xx {id, reason}`। একসাথে অনেকগুলো cancel করা যায় না।
- Approve হওয়ার পরের Cancel আলাদা মেনু, শুধু Sales Order-এর জন্য (`Cancel › Sales Order After Approval`)। Fund Transfer-এর শুধু "Before Approval" cancel আছে।

### 17.4 নোটিফিকেশন বেল [দেখা]
- `GET /api/DASH008` থেকে আসে `[{ButtonTitle, NumOfUnapprovedRecords, HasPermission}]`। প্রতি **২ মিনিটে** নতুন করে আনা হয়, আর localStorage-এ cache রাখা হয়।
- বেলের সংখ্যা = সব ধরনের pending ডকুমেন্টের যোগফল। ড্রপডাউনে প্রতিটা ধরনের সংখ্যা দেখায়। ক্লিক করলে সেই Approve পেজে যায়, আর শুধু `HasPermission` থাকলে দেখায়।
- **২৯টা ধরন**:
  - Purchase: PurchaseReturn, PurRecFinalize, PurReqFinalize, CSSheet, PurchaseOrder, GoodReceive
  - Sales: DemandOrder, SalesOrder, DeliveryChallan, SalesInvoice, SalesReturn, DamageReturn
  - Transfer: TranReqFinalize, TranOrder, TranChallan, TranReceive, InternalTransfer
  - Accounts: Collection, Payment, Voucher
  - Import: ProformaInvoice, LCOpening, ImportCosting, LIMStockIn, ImportedStockIn
  - RMA: ComplainReceive, CustomerDelivery, ReplacementClaim, ReplacementReceive
- বেলের সাথে আরো তিনটা **সতর্কতা রিপোর্ট** আছে: **Minimum Stock**, **Re-Order Point** আর **Security Instrument** (মেয়াদ শেষ হতে যাওয়া জামানত বা গ্যারান্টি)।
- বর্তমান অবস্থা: GoodReceive ২টা আর PurchaseReturn ২টা pending। বাকিগুলো ০, নয়তো এই ইউজারের জন্য `HasPermission` = false।
  - লক্ষ্য করুন: Sales Invoice, Collection আর Payment-এর Approve পেজ খোলা থাকলেও বেলে এগুলোর `HasPermission` false দেখায়। অর্থাৎ বেলের অনুমতি আর পেজের অনুমতি পুরোপুরি এক নয় [অনুমান: বেলের নিজস্ব হিসাব]।

### 17.5 Approval-যোগ্য ডকুমেন্টের পূর্ণ তালিকা (Approve মেনু থেকে)
| মডিউল | Approve | Cancel (pending) | Edit Before / After |
|---|---|---|---|
| Import | PI, LC Opening, Import Costing, LIM Stock In, Imported Stock | একই | PI, LC, Costing (Before/After) |
| Export | PI, LC Received, Commercial Invoice | একই | একই |
| Inventory | Requisition, Item Issue, Stock Adjustment, Adjustment Claim, Claim Finalize, Party Adjustment | একই | Stock/Party Adj, Claim (Before) |
| Purchase | Req Finalize, CS Sheet, PO, Goods Receive, Receive Finalize, Purchase Return | একই | PO আর Purchase (Before/After) |
| Production | Material Issue, Conversion, Production Ratio, Production | একই | Ratio, Production (Before) |
| Sales | Quotation, Demand Order, Sales Order, MRC Profile, Delivery Challan, Challan Return, Invoice, Sales Return, Damage Return | একই, + **SO After Approval** | Quotation, DO, SO (Before/After), Challan Return, Invoice (Before, এবং আলাদা "Invoice" আর "Invoice (False)"), MRC, Sales Return |
| Transfer | Req Finalize, Order, Challan, Receive, Internal Transfer | একই | Order, Challan, Receive (Before) |
| RMA | Complain Receive, Customer Delivery, Replacement Claim, Replacement Receive | একই | Delivery, Claim, Receive |
| Accounts | Collection, Payment, Voucher, Fund Transfer, Fund Receive, Security Instrument | একই (Fund Transfer শুধু Before) | Customer, Supplier, Accounts opening, Collection, Payment, Debit, Credit, Contra, Journal |
| HR | Leave (Reliever), Leave, Loan, Outdoor Duty, **Salary Sheet** | একই | Leave, Loan |
| Others | Task Entry, Debit Note, Credit Note | একই | – |

### 17.6 Oner বনাম againERP (`docs/approval.md`) — তুলনা আর gap list
| বিষয় | Oner | againERP (এখন) | পরামর্শ |
|---|---|---|---|
| কখন approval লাগে | **সবসময়**, প্রতিটা ডকুমেন্ট (এন্ট্রি আর approve আলাদা) | শুধু যার Approve permission নেই; approver সরাসরি চূড়ান্ত করে | againERP-র পদ্ধতি ব্যবহারে সহজ। চাইলে মডিউল অনুযায়ী feature flag রাখুন: "সবসময় approval লাগবে" (Oner-ধাঁচ) অথবা "permission না থাকলে লাগবে" |
| কে approve করে | ডকুমেন্টের ধরন অনুযায়ী Approve মেনুর অনুমতি | Role-এর মডিউল অনুযায়ী Approve টিক | againERP-রটা সহজ। কিন্তু খুঁটিনাটি নিয়ন্ত্রণ দরকার হলে ডকুমেন্টের ধরন অনুযায়ী override রাখা যায় |
| নিজের এন্ট্রি নিজে approve | Feature `EntryByApproveCancel` দিয়ে বন্ধ করা যায় | approver নিজেরটা সরাসরি চূড়ান্ত করে; sender নিজের request decide করতে পারে না | **নতুন**: কঠোর maker-checker-এর জন্য একটা flag রাখুন, "approver হলেও নিজের ডকুমেন্টে অন্য কারো approval লাগবে" (যেমন টাকার পেমেন্টে) |
| Approve-এর সময় পাসওয়ার্ড | Feature `CheckPassword` | নেই | **নতুন** (সহজ): টাকা-সংক্রান্ত approve-এ আবার পাসওয়ার্ড বা PIN চাওয়ার ঐচ্ছিক flag |
| Bulk approve | Invoice, Collection, Payment, Voucher-এ, সাথে নির্বাচিতগুলোর মোট টাকা | প্রতিটা সারিতে আলাদা Approve | **নতুন**: checkbox দিয়ে একসাথে approve, নিচে মোট টাকা দেখানো, আর প্রতিটার ফল আলাদা দেখানো (কোনটা সফল, কোনটা ব্যর্থ) |
| Reject | নেই (Cancel + কারণ) | Reject + কারণ, RMA-তে "Return for correction" | againERP এগিয়ে আছে |
| Approve-এর আগে ডকুমেন্ট দেখা | Detail popup + PDF Print | মূল drawer খোলে | againERP এগিয়ে আছে। **নতুন**: সারি থেকেই Print বা PDF |
| Approve হওয়ার পর সংশোধন | Edit After Approval (কিছু ডকুমেন্টে), Cancel After Approval (SO) | Order edit request (একবারের জন্য unlock) | একই ধাঁচ। Invoice আর Payment-এ "approve হওয়ার পর cancel" করলে উল্টো ভাউচার তৈরি হবে, এভাবে বাড়ান |
| স্তর বা টাকার সীমা | নেই (Leave-এ Reliever বাদে) | নেই (endpoint-এর নিজস্ব approval limit আছে) | **নতুন**: `approval_policies(module, doc_type, min_amount, max_amount, required_role, levels)`, যেমন ৫০,০০০ টাকার বেশি পেমেন্টে ২ স্তর |
| নোটিফিকেশন | ২ মিনিট পরপর আনা, ২৯টা ধরন, ধরন অনুযায়ী সংখ্যা আর লিংক, সাথে স্টক সতর্কতা | ৩০ সেকেন্ড পরপর, গ্রুপ অনুযায়ী সংখ্যা | **নতুন**: বেলে Min Stock, Re-order আর মেয়াদ শেষ হতে যাওয়া চেক বা গ্যারান্টির সতর্কতা |
| Approve-এর পর বেল | localStorage cache মুছে নতুন করে আনা | তালিকা নিজে refresh হয় | – |
| Audit | Entry By, Approved By, ApprovedDate, CancelReason | sender, approver, reason, স্ট্যাটাস | ঠিক আছে |
| HR-এর দুই ধাপ | Leave: Reliever, তারপর ঊর্ধ্বতন | – | HRM তৈরির সময় মনে রাখুন (`docs/HRM-*.md`) |

**againERP-তে যোগ করার মতো, অগ্রাধিকার অনুযায়ী:**
1. **Bulk approve** (checkbox, মোট টাকা, প্রতিটার ফল আলাদা)। Collection, Payment আর Invoice দিয়ে শুরু করুন।
2. **নিজের ডকুমেন্টে কঠোর maker-checker flag** (কোম্পানি বা মডিউল অনুযায়ী)।
3. **Approve-এ পাসওয়ার্ড বা PIN-এর flag** (Finance)।
4. **Approval policy** (টাকার সীমা আর একাধিক স্তর)।
5. **বেলে স্টক আর চেকের সতর্কতা** (Min Stock, Re-order, Security Instrument বা চেকের মেয়াদ)।
6. **Approve-এর সারি থেকেই Print বা PDF**।

---

## 18. Serial আর Non-serial প্রোডাক্ট: কোথায় কীভাবে কাজ করে [২৮ অক্টোবর ২০২৬]

> পদ্ধতি: ১৮টা ফর্মের সিরিয়াল-সংক্রান্ত UI, ফাংশন আর সতর্কবার্তা পড়া হয়েছে। স্টক আর সিরিয়ালের lookup API, পুরো প্রোডাক্ট তালিকার সংখ্যা, আর একটা স্টকের সিরিয়ালের Advance Search কাঠামো দেখা হয়েছে। কিছু Save করা হয়নি।

### 18.1 নিয়ন্ত্রণ: Product মাস্টারের ফ্ল্যাগ [দেখা]
| ফ্ল্যাগ | প্রভাব |
|---|---|
| `SerialAvailable` | চালু থাকলে প্রতিটা লেনদেনে প্রতিটা ইউনিটের সিরিয়াল লাগবে। ফর্মে পরিমাণের বদলে সিরিয়ালের popup খোলে, আর পরিমাণ = সিরিয়ালের সংখ্যা। |
| `IsStockMaintain` | বন্ধ থাকলে (যেমন সার্ভিস) স্টক চেক বা কমানো হয় না |
| `IsAllowNegativeSales` | স্টক না থাকলেও বিক্রি করা যাবে (§18.5) |
| `IsWarrantyAvailable`, `WarrantyDays`, `IsServiceWarranty`, `ServiceWarrantyDays`, `IsLifeTimeWarranty` | সিরিয়াল ধরে ওয়ারেন্টি হিসাব (RMA, Advance Search) |
| `ReturnAllowedDays` | বিক্রির কত দিনের মধ্যে ফেরত নেওয়া যাবে |
| ProductDimension (variant) | সিরিয়াল সবসময় Product **+ Dimension + Unit** স্তরে থাকে |

- Product ফর্মে "Serial Available" টিক শুধু UI-তে চালু-বন্ধ হয়। লেনদেন হয়ে যাওয়ার পর বদলানো আটকানো হয় কিনা, সেটা client-এ দেখা যায়নি। তালিকায় `IsProductEditable` আছে, সব প্রোডাক্টে true। [অনুমান: সার্ভারে আটকানোর ব্যবস্থা থাকতে পারে, নাও পারে]
- **বর্তমান ডেটা**: মোট **৮,৯৯৯টা প্রোডাক্ট**। **৪,৩৭৭টা serial (৪৯%)**, ৪,৬২২টা non-serial।
  - দামি জিনিস প্রায় সব serial: SSD/HDD ২৪৮/১, Motherboard ২৪৭/১, Laptop ২২৫/২, Monitor ২০৫/৫, Router ১৯১/১, CCTV ১৯৪/১৮।
  - খরচের জিনিস non-serial: Toner ০/২০০, Casing ১৭/২৭৬।
  - Accessory দুই ধরনেরই: Keyboard ১৬৭/২৩৮, Mouse ১৭৯/২২৫, Speaker ৮৬/২৮৪।

### 18.2 সিরিয়ালের ডেটা কাঠামো [দেখা]
প্রতিটা লেনদেনের লাইনে থাকে `SerialLists[]`:
```
{ Serial, AdditionalSerial, OriginalSerial, IsEditable, (WarehouseId, Warehouse), IsSelected }
```
- **AdditionalSerial**: দ্বিতীয় নম্বর, যেমন IMEI-2 বা MAC। খোঁজা আর প্রিন্টের সময় সাথে দেখায়।
- **OriginalSerial + IsEditable**: approve-এর আগে ভুল সিরিয়াল ঠিক করার সুবিধা। আসল মানটা `OriginalSerial`-এ থেকে যায়, তাই সার্ভার বুঝতে পারে কোনটা বদলানো হয়েছে।
- Edit করার সময় `DeletedSerialLists` আলাদা করে পাঠানো হয়।
- Non-serial লাইনে থাকে `NonSerialWarehouseLists[] {WarehouseId, Warehouse, Quantity}`, অর্থাৎ একটা লাইনের পরিমাণ কয়েকটা ওয়্যারহাউস থেকে ভাগ করে নেওয়া যায়।
- সিরিয়াল খোঁজার API (যেমন `FetchSerialNo(q)`) প্রোডাক্ট না দিয়েই সিরিয়াল খোঁজে। [অনুমান: পুরো কোম্পানিতে সিরিয়াল ইউনিক ধরা হয়, অন্তত সক্রিয় স্টকে]

### 18.3 স্টক থেকে সিরিয়াল আর পরিমাণ জানার lookup [দেখা]
| ধরন | Serial lookup | Non-serial পরিমাণ |
|---|---|---|
| **Current** (বিক্রিযোগ্য) | product + dimension + unit, ওয়্যারহাউস বা stock type অনুযায়ী, অথবা সব ওয়্যারহাউস মিলিয়ে, অথবা "non-saleable" ওয়্যারহাউস বাদ দিয়ে। আর শুধু সিরিয়াল দিয়ে খোঁজা (`FetchSerialNo`) | ওয়্যারহাউস চেক ছাড়া, অথবা non-saleable বাদ দিয়ে |
| **RMA** | product অনুযায়ী (ওয়্যারহাউস ধরে বা না ধরে) | ✓ |
| **Bad** | product অনুযায়ী, অথবা শুধু সিরিয়াল দিয়ে | ✓ |
| **WIP** | product অনুযায়ী | ✓ |
| **Opening** | opening stock-এর সিরিয়াল (Purchase Return-এ "Previous Purchase"-এর জন্য) | – |

**ওয়্যারহাউসে "non-saleable" ধারণা আছে।** বিক্রির ফর্মে এমন ওয়্যারহাউসের স্টক দেখায় না, যেমন ডেমো বা শোকেসের মাল।

### 18.4 সিরিয়াল এন্ট্রির পদ্ধতি (নতুন সিরিয়াল আসে এমন ফর্মে) [দেখা]
**কোথায় লাগে**: Direct Purchase, Sales Return (Previous Sales থেকে), Direct Sales-এর negative sales অংশ, RMA (নতুন সিরিয়াল), আর Data Import (Current Stock বা RMA Stock)।

| পদ্ধতি | কীভাবে কাজ করে |
|---|---|
| **Normal → Scan For Single Serial** (`S`) | প্রতিটা সিরিয়াল টাইপ বা স্ক্যান করে Enter চাপলে যোগ হয়। সাথে ঐচ্ছিক Additional Serial। |
| **Normal → Scan For Bulk Serial** (`M`) | স্ক্যানার এক টানে অনেকগুলো সিরিয়াল পাঠায়। একটা **separator** (নির্দিষ্ট key-code-এর ক্রম) দেখলেই সিরিয়ালটা আলাদা করে যোগ হয়। |
| **Sequence** | `Serial From` আর `Serial To` (শুধু সংখ্যা) দিলে মাঝের সব সংখ্যা তৈরি হয়। সতর্কবার্তা: "Serial From and To value must be provided", "Serial To value can not less than From value"। |
| **Upload bulk serial** | `.txt` ফাইল থেকে সিরিয়ালের তালিকা |

- **যাচাই (ফর্মে)**: একই ডকুমেন্টে একই সিরিয়াল দুবার দেওয়া যায় না (ছোট-বড় হাতের অক্ষর আলাদা ধরা হয় না)। ফাঁকা হলে "Serial no missing."
- **যাচাই (সার্ভারে)** [অনুমান]: সিরিয়াল আগে থেকে স্টকে আছে কিনা, তা Save বা approve-এর সময় চেক হয়।
- **বড় তালিকা**: ১০টা করে lazy load, খোঁজার ঘর, একটা একটা বা সব একসাথে মোছা, "Total Serial" সংখ্যা।
- **পরিমাণ = সিরিয়ালের সংখ্যা।** serial প্রোডাক্টে Quantity ঘর হাতে লেখা যায় না।

### 18.5 সিরিয়াল বাছাইয়ের পদ্ধতি (স্টক থেকে মাল বের হয় এমন ফর্মে) [দেখা]
**কোথায় লাগে**: Delivery Challan, Invoice From Order, Direct Sales, Internal Transfer, Purchase Return, Sales Return (System Sales থেকে), Customer Delivery (RMA), Bar Code Generate।

| পদ্ধতি | কীভাবে কাজ করে |
|---|---|
| **Qty. of Serial** | একটা সংখ্যা N দিলে স্টক থেকে **প্রথম N-টা** সিরিয়াল নিজে বাছাই হয়। N যেন Available-এর বেশি না হয়। |
| **Sequence** | একটা **prefix** (`serialInitial`) আর From–To সংখ্যা দিলে `prefix+সংখ্যা`-এর সাথে মেলে এমন স্টকের সিরিয়ালগুলো বাছাই হয় |
| **Scan** (Single বা Bulk) | স্ক্যান করলে স্টক তালিকায় খুঁজে টিক পড়ে যায় |
| **Check All বা একটা একটা** | তালিকায় হাতে টিক দেওয়া |

- popup-এ দেখায়: Available বা Total, Order Qty, Remaining Qty, Total Selected।
- **Direct Sales-এ "সিরিয়াল আগে" পদ্ধতি**: উপরের Serial ঘরে স্ক্যান করলে (২ অক্ষর থেকে খোঁজা শুরু, Enter চাপলে হুবহু মিল) **প্রোডাক্ট, Dimension, Unit, Warehouse আর দাম নিজে থেকে বসে যায়**, সাথে শেষ ৩টা বিক্রির দামও দেখায়। কাউন্টারে এটাই সবচেয়ে দ্রুত। Transaction From = Current অথবা **Bad** stock (নষ্ট মালও বিক্রি করা যায়)।
- **Negative sales**: স্টকে নেই এমন সিরিয়ালও বিক্রিতে দেওয়া যায়। আলাদা "Added Serial" তালিকায় Normal বা Sequence দিয়ে দিতে হয়। শর্ত: প্রোডাক্টে `IsAllowNegativeSales` চালু থাকতে হবে। Feature `AllowAutoPurchaseForNegativeSales` চালু থাকলে নিজে থেকে purchase তৈরি হয় [অনুমান], এখন বন্ধ।
- **সতর্কবার্তা**:
  - "Have not enough stock to direct sales."
  - "Total quantity can not be greater than available quantity."
  - "You are crossing minimum stock quantity." (`CheckMinStockQtyAtSales`)
  - "Serial not added to …" (Challan-এ সিরিয়াল ছাড়া Save করলে)

### 18.6 Non-serial প্রোডাক্ট [দেখা]
- লাইনে শুধু **Quantity** থাকে। Available Stock দেখায় (`ShowStockInfoAtSales`)। `IsStockMaintain` চালু থাকলে Quantity কখনো Available-এর বেশি হতে পারে না, ফর্ম নিজে থেকে কমিয়ে দেয়।
- **ওয়্যারহাউস অনুযায়ী ভাগ** (Challan, Invoice From Order, Internal Transfer): non-serial popup-এ প্রতিটা ওয়্যারহাউসের Current Stock দেখায়, আর কোন ওয়্যারহাউস থেকে কত যাবে লিখতে হয় (`NonSerialWarehouseLists`)। সাথে Order Qty, Remaining আর Total Quantity দেখায়।
- **পরিমাণ অনুযায়ী দাম**: Quantity বদলালে Price Type-এর স্ল্যাব (Lower থেকে Upper পরিমাণ) অনুযায়ী দাম আর Discount নতুন করে বসে (`checkNonSerialQuantity`)।
- RMA-তে non-serial মাল ফেরত এলে সিস্টেম একটা সিরিয়াল **তৈরি করে দেয়** (§18.8)।

### 18.7 কোন ফর্মে সিরিয়াল কোন পর্যায়ে লাগে
| ফর্ম | Serial প্রোডাক্ট | Non-serial | মন্তব্য |
|---|---|---|---|
| Quotation, Sales Order | লাগে না | Qty | অর্ডারে সিরিয়াল নেই। স্টক চেক আর min-stock-এর সতর্কতা আছে। |
| **Delivery Challan** | **বাছাই** (স্টক থেকে) | Qty + ওয়্যারহাউস | মাল এখানেই বের হয় |
| Invoice (Challan থেকে) | Challan-এর সিরিয়াল দেখায় (শুধু দেখার জন্য) | – | |
| Invoice From Order | বাছাই + স্ক্যান | Qty + ওয়্যারহাউস | Challan আর Invoice একসাথে |
| **Direct Sales** | সিরিয়াল আগে বা বাছাই, আর negative sales-এ এন্ট্রি | Qty | |
| **Direct Purchase** | **এন্ট্রি** (Normal, Sequence, Scan, Upload) | Qty + ওয়্যারহাউস | MRP আর Warranty লাইনে |
| Receive Finalize | – (GRN থেকে আসে) | – | শুধু দাম চূড়ান্ত করা |
| Purchase Return | বাছাই (কেনার বা opening সিরিয়াল থেকে) | Qty | |
| Sales Return | System Sales হলে ইনভয়েসের সিরিয়াল থেকে বাছাই; Previous Sales হলে এন্ট্রি | Qty | |
| Internal Transfer | বাছাই (From Stock Type অনুযায়ী: Current, RMA, Bad বা WIP) | Qty + ওয়্যারহাউস | |
| Complain Receive (RMA) | **SERIAL SEARCH** (বিক্রির ইনভয়েস থেকে); না পাওয়া গেলে **Generate Serial** | একই | |
| Customer Delivery (RMA) | পুরনো সিরিয়াল + নতুন সিরিয়াল (RMA stock থেকে বাছাই) | | |
| Replacement Claim / Receive | সিরিয়াল দিয়ে খোঁজা, তারপর সাপ্লায়ার; Receive-এ নতুন সিরিয়াল | | "No Supplier found for this serial." |
| Bar Code Generate | স্টকের সিরিয়াল বাছাই করে প্রতিটা সিরিয়ালের লেবেল | পরিমাণ অনুযায়ী লেবেল | |

### 18.8 RMA-তে সিরিয়াল [দেখা]
- **SERIAL SEARCH** (`FetchProductBySerialFromInvoice`): সিরিয়াল দিলে খোঁজে
  - **System Sales**-এর ইনভয়েসে, এবং চাইলে নির্দিষ্ট Invoice বা প্রোডাক্টে সীমাবদ্ধ করে।
  - পাওয়া গেলে প্রোডাক্ট, cost, ইনভয়েস আর **ওয়ারেন্টি বা সার্ভিস ওয়ারেন্টির বাকি মেয়াদ** নিজে থেকে বসে।
  - **Previous Sales** হলে (সিস্টেম চালু হওয়ার আগের বিক্রি) আগের ওয়ারেন্টির তথ্য থেকে আসে।
- **Generate Serial**: প্রোডাক্ট non-serial হলে, অথবা Previous বা Unknown Sales হলে, সিস্টেম ৮ অক্ষরের একটা অনন্য সিরিয়াল তৈরি করে দেয় (`GenerateProductSerial(8)`)। "Bulk Qty" দিলে একসাথে N-টা তৈরি হয়। এতে RMA-র পুরো প্রক্রিয়ায় প্রতিটা ইউনিট আলাদাভাবে চেনা যায়।
- সতর্কবার্তা: "Invalid serial.", "Customer Name or Product serial is empty!!!"

### 18.9 সিরিয়ালের ইতিহাস: Advance Search › Serial [দেখা]
- খোঁজার ধরন: **Specific** (হুবহু) অথবা **Like** (আংশিক মিল)।
- ফলাফল **১৯টা তালিকায়** আসে:
  `stock, purchase, purchaseReturn, importIn, stockAdjustment, salesInvoice, salesReturn, damageReturn, stockTransfer (লোকেশন), internalStockTransfer, complainReceive, replacementClaim, replacementReceive, customerDelivery, prevSalesInvoice, conversion, warranty, deliveryChallan, challanReturn`
- কলামের মধ্যে আছে: Main ও New Product আর Serial (RMA-তে বদলি হলে), Warranty আর Warranty Left, Service Warranty আর Left, Stock Location, Warehouse, Stock Type, Supplier, Customer, তারিখ, Entry By, Status।
- **Product Search**: Stock Type, Location, Warehouse, Group থেকে Model পর্যন্ত, Product আর Dimension দিয়ে খোঁজা যায়। দেখায় Stock Qty, গড় খরচ, শেষ purchase আর sale, আর সিরিয়াল।

### 18.10 [againERP] ডিজাইন প্রস্তাব
```
products(..., track_serial BOOL, track_stock BOOL, allow_negative BOOL, warranty_days, service_warranty_days, lifetime_warranty)
warehouses(..., is_saleable BOOL)                    -- non-saleable ওয়্যারহাউস (ডেমো বা শোকেস)

product_serials(                                    -- প্রতিটা ইউনিটের বর্তমান অবস্থা (একটাই সারি)
   id, product_id, variant_id, unit_id, serial, serial_norm /*trim+lower*/, additional_serial,
   status ENUM('in_stock','sold','in_transit','rma','bad','wip','returned_to_supplier','scrapped'),
   location_id, warehouse_id, stock_type,
   purchase_doc_type, purchase_doc_id, supplier_id, purchase_date, unit_cost,
   sale_doc_id NULL, customer_id NULL, sale_date NULL, warranty_until NULL, service_warranty_until NULL,
   is_system_generated BOOL,                         -- RMA-তে তৈরি সিরিয়াল
   UNIQUE(company_id, serial_norm) WHERE status <> 'scrapped')   -- অথবা product অনুযায়ী ইউনিক (নীতি ঠিক করুন)

serial_movements(                                   -- পুরো ইতিহাস (Advance Search-এর ১৯ তালিকার বিকল্প, একটা টেবিলে)
   id, serial_id, event ENUM('purchase','purchase_return','import_in','adjustment','challan','challan_return',
          'invoice','sales_return','damage_return','transfer_out','transfer_in','internal_transfer',
          'rma_receive','rma_claim','rma_replace_in','rma_deliver','conversion','opening'),
   doc_type, doc_id, doc_no, from_wh, to_wh, from_stock_type, to_stock_type, party_type, party_id,
   at, by_user)
doc_line_serials(doc_type, doc_line_id, serial_id, original_serial NULL)   -- লাইনের সাথে সিরিয়ালের যোগ
doc_line_allocations(doc_type, doc_line_id, warehouse_id, qty)            -- non-serial ওয়্যারহাউস ভাগ
```
**UI আর নিয়ম:**
- এন্ট্রির পদ্ধতি: Single Scan (Enter), Bulk Scan (separator কনফিগার করা যায়: newline, comma, tab বা নির্দিষ্ট চিহ্ন), Sequence (prefix + From–To + শূন্য দিয়ে ভরাট, যা Oner-এ নেই), Paste বা Upload (.txt/.csv/.xlsx)।
- বাছাইয়ের পদ্ধতি: Qty (**FIFO**: সবচেয়ে পুরনো purchase আগে), Sequence (prefix + রেঞ্জ), Scan, Check।
- সার্ভারে যাচাই (Save আর approve, দুবারই): এন্ট্রিতে সিরিয়াল আগে থেকে আছে কিনা; বাছাইয়ে স্টকে আছে কিনা, এই প্রোডাক্ট আর ওয়্যারহাউসের কিনা, অন্য ড্রাফটে আটকে নেই কিনা (soft reservation)।
- **সিরিয়াল আগে বিক্রি** (POS বা Direct Sales): স্ক্যান করলেই প্রোডাক্ট, variant, ওয়্যারহাউস আর দাম বসে যাবে।
- **লেনদেন হওয়ার পর `track_serial` বদলানো আটকানো**, অথবা একটা "convert to serial" wizard (বর্তমান স্টকের সিরিয়াল চাওয়া হবে)।
- **RMA**: সিরিয়াল দিয়ে খুঁজলে ইনভয়েস, ওয়ারেন্টির বাকি মেয়াদ আর সাপ্লায়ার (claim-এর জন্য) আসবে। না পাওয়া গেলে system-generated সিরিয়াল।
- **Serial history পেজ**: একটা timeline (`serial_movements`), সাথে বর্তমান অবস্থা, ওয়ারেন্টি আর লাভ (purchase cost বনাম sale price)।

---

## 19. againERP-তে কী বানানো হয়েছে (বাস্তবায়নের অবস্থা) [২৮ অক্টোবর ২০২৬]
> নোট: §15–18-এর মতো এটাও পরে যোগ করা, তাই §14-এর আগে বসানো। এখানে লেখা থাকে এই spec দেখে againERP-তে কোন অংশ বানানো হয়েছে। বানানো হয়েছে **againERP-র নিজস্ব গঠনে** (নিজের service, router, schema, `FinanceAgListGrid`, common drawer)। Oner-এর কোড বা ডিজাইন কপি করা হয়নি। কোড-স্তরের বিস্তারিত আছে `docs/AGAINERP-AUDIT.md`-এর §4.3 (Cheque) আর §4.5 (Finance)-এ।
>
> **অবস্থা (২৮ অক্টোবর ২০২৬):** সব বানানো, লোকাল কন্টেইনারে live যাচাই করা, কিন্তু এখনো commit হয়নি।

### 19.1 Accounts & Finance মেনু: Oner বনাম againERP

| Oner মেনু | againERP-তে কোথায় | অবস্থা | spec |
|---|---|---|---|
| **Collection** | Finance → Payments → **Collection** বাটন। কাস্টমার বাছাই করলে কাস্টমারের Record payment drawer খোলে: বাছাই করা ইনভয়েস আগে, বাকি পুরনো থেকে নতুন ক্রমে (FIFO), বাড়তি থাকলে advance, সাথে write-off আর চেক। | বানানো | §8.2, §15.9 |
| **Payment** | Finance → Payments → **Payment** বাটন, সাপ্লায়ারের জন্য একইভাবে। | বানানো | §8.2, §15.9 |
| **Party Transaction Settlement** | Payments → **Party transaction settlement** (`/finance/settlements`) | বানানো | §15.9 |
| **Payment Settlement** | Payments → **Payment settlement** (`/finance/settlements?party=supplier`) | বানানো | §15.9 |
| **Invoice Wise Pending Collection** | Finance → **Receivables**। প্রতিটা ইনভয়েসের Amount, Paid, Balance, Status আর নতুন **Settled by** কলাম। Payables-এও একই কলাম। | বানানো | §15.9 |
| **Cheque Treatment** | Payments → Cheques: একসাথে treatment (bulk), D → S (আবার পাঠানো), D → B (বন্ধ), আর Cheque Reports | বানানো (আগের session) | §11 |
| **Debit / Payment** | Finance → **Vouchers** → Debit / Payment | বানানো | §16.4, §16.5 |
| **Credit / Receive** | Vouchers → Credit / Receive | বানানো | §16.5 |
| **Contra** | Vouchers → Contra (Cash ↔ Bank, Bank ↔ Bank) | বানানো (শুধু Instant) | §16.5 |
| **Journal** | Vouchers → Journal (যেকোনো হেড, Dr = Cr) | বানানো | §16.5 |
| **Voucher From Template** | Vouchers → **Voucher from template**, আর **Voucher templates** পেজ | বানানো | §8.1 (Template), §16.5 |

### 19.2 কীভাবে কাজ করে (Oner-এর সাথে পার্থক্যসহ)

**Collection আর Payment**
- আলাদা নতুন ফর্ম বানানো হয়নি। againERP-তে কাস্টমার বা সাপ্লায়ারের ledger থেকে payment নেওয়ার drawer আগে থেকেই ছিল। Finance থেকে সেটাই খোলে, তাই একই টাকা দুই জায়গা থেকে দুইভাবে ঢোকে না।
- **একটা পুরনো ভুল ঠিক হয়েছে:** ledger থেকে নেওয়া payment (`customer_payment` / `supplier_payment`) এতদিন GL-এ কোনো ভাউচার তৈরি করত না। ফলে Cash/Bank, Accounts Receivable আর Accounts Payable ভুল দেখাত।
  - এখন কাস্টমারের payment-এ: **Dr Cash/Bank, Cr Accounts Receivable (1100)**। সাপ্লায়ারের payment-এ: **Dr Accounts Payable (2100), Cr Cash/Bank**। এটা §16.6-এর Oner নিয়মের সাথে মেলে।
  - পুরনো payment-গুলোর ভাউচার সার্ভার চালু হওয়ার সময় একবার নিজে থেকে তৈরি হয় (লোকালে ৩টা)।
  - সাপ্লায়ার payment মুছলে উল্টো ভাউচার (reversal) post হয়। আগের ভাউচার মোছা হয় না।
- কাস্টমারের payment-এ mode "Cheque" দিলে এখন চেকটা cheque register-এ যায় (Oner-এর মতো N অবস্থা থেকে treatment)। আগে টাকা সাথে সাথে পাওয়া হয়ে গেছে বলে ধরা হতো।
- **Oner থেকে পার্থক্য:** এক collection-এ একাধিক mode (CollectionInfoLists) নেই। প্রতিটা mode-এর জন্য আলাদা receipt দিতে হয়। `CollectionAgainst` (Adv/Pre/SO/Inv)-এর কাজ করে "কোন ইনভয়েস বাছাই করা হলো", আর বাকি অংশ FIFO বা advance-এ যায়।

**Voucher (§16.4–16.5)**
- চার ধরন, আর নম্বর হয় এভাবে: **DV-YYYY-nnnnn** (Debit/Payment), **CV-** (Credit/Receive), **CON-** (Contra), **JV-** (Journal)।
  - Debit: "Paid from" একটা Cash বা Bank অ্যাকাউন্ট (সেটা Cr হয়), নিচে একাধিক Dr লাইন।
  - Credit: "Received into" (সেটা Dr হয়), নিচে একাধিক Cr লাইন।
  - Contra: From → To অ্যাকাউন্ট আর Amount।
  - Journal: যেকোনো হেড, Dr আর Cr সমান না হলে save হয় না।
  - প্রতিটা লাইনে থাকে Account head, Particulars, **Cost center** (Oner-এর Project-এর জায়গায়) আর Amount (Journal-এ Debit ও Credit)।
- **জীবনচক্র:** Draft → **Approve** → **Cancel**।
  - Draft: edit বা delete করা যায়।
  - Approve করলে একটা journal post হয়, সাথে Cash/Bank অ্যাকাউন্টের টাকার চলাচলও রেকর্ড হয়। বন্ধ মাসে (period lock) post হয় না, আর approval limit (`finance.voucher`) চেক হয়।
  - Cancel-এ কারণ দিতে হয়, আর উল্টো entry (reversal) post হয়। মূল ভাউচার রেকর্ডে থেকে যায়, মোছা হয় না।
- **Oner-এর আলাদা "Posting" ধাপ নেই।** againERP-তে approve-ই post, আর back-date আটকানো হয় Fiscal periods-এর মাস লক দিয়ে (§16.10-এর প্রস্তাব অনুযায়ী)।
- **কোন হেড লাইনে দেওয়া যায় না** (Oner-এর Cash/Bank Identification-এর মতো):
  - Cash/Bank হেড: এগুলো ভাউচারের অ্যাকাউন্ট ফিল্ড দিয়ে নড়ে।
  - Accounts Receivable আর Accounts Payable: এগুলো Collection/Payment দিয়ে নড়ে, যাতে party ledger আর control account মিলে থাকে (§15.11-এর নিয়ন্ত্রণ চেক)।
  - Cheque In Hand, Cheques Under Collection আর Cheques Issued: এগুলো cheque register দিয়ে নড়ে।
- **Voucher Template:** নাম, ধরন, বিবরণ, অ্যাকাউন্ট আর লাইন। লাইনে Amount খালি রাখা যায়, ভাউচার দেওয়ার সময় বসানো হয়। যেকোনো ভাউচার "Save as template" দিয়ে template বানানো যায়।
- **বানানো হয়নি (ইচ্ছাকৃত):**
  - Eventual Contra (Transit A/C দিয়ে)
  - Debit ভাউচার থেকে চেক ইস্যু ("Cheque Issue"/Auto Honor)। চেক দিতে Payment → Cheque ব্যবহার করুন।
  - Bulk approve আর approve-এর সময় পাসওয়ার্ড
  - মাল্টি-কারেন্সি লাইন

**Bill-wise Settlement (§15.9)**
- againERP টাকা আসার সাথে সাথেই ইনভয়েস বা বিলে বসিয়ে দেয় (বাছাই করা আগে, তারপর FIFO)। তাই Oner-এর মতো "ঝুলে থাকা collection" থাকে না। এখানে settlement মানে: এক ইনভয়েসে বসা টাকা **সরিয়ে** একই পার্টির আরেক ইনভয়েসে বসানো।
- **Settlement-এর ফর্ম:**
  - প্রথমে পার্টি বাছাই করুন। তারপর তালিকায় আসে প্রতিটা ইনভয়েস বা বিলের Amount, Settled, Due, Settled by, **Take off** আর **Put on**।
  - "Spread oldest first" বাটন Take off-এর মোট টাকা পুরনো open ইনভয়েসগুলোতে বসিয়ে দেয় (Oner-এর auto FIFO)। চাইলে হাতে বদলানো যায়।
  - **দুই পাশ সমান না হলে save হয় না** (Oner-এর নিয়ম)। কোনো ইনভয়েসে Due-এর বেশি বসানো যায় না, আর Settled-এর বেশি সরানো যায় না।
- নম্বর **STL-YYYY-nnnnn**। পার্টির মোট বকেয়া আর AR/AP বদলায় না, তাই কোনো ভাউচার হয় না। কাস্টমারের sales order-এর নিজের paid/due-ও সাথে বদলায়।
- **Un-settle** (§15.11-এর প্রস্তাব): আলাদা বাটন নেই। উল্টো দিকে আরেকটা settlement দিলেই আগের অবস্থায় ফেরে।
- **Settled by:** কোন টাকা কোন ইনভয়েস বা বিলে গেছে, তা একটা টেবিলে রাখা হয় (`finance_allocations`, §15.11-এর `bill_allocations`-এর মতো)।
  - এটা লেখা হয় তিন জায়গা থেকে: পার্টির payment, প্রতিটা ইনভয়েসের Settle আর settlement।
  - সাথে দেখায় ইনভয়েসের সাথে যুক্ত চেক আর sales order-এর payment।
  - এই হিসাব রাখা শুরু হওয়ার আগে যে টাকা বসেছিল, সেটা দেখায় "Advance / earlier receipt" হিসেবে।
- **Oner থেকে পার্থক্য:** Settle By-তে Sales Return (`SR`) আলাদা করে বাছাই করতে হয় না। againERP-তে credit note নিজে থেকেই আগে ইনভয়েসে বসে, পরে settlement দিয়ে সরানো যায়।

### 19.3 User Access / Security: Oner বনাম againERP (§3)

| Oner স্তর | againERP-তে | অবস্থা |
|---|---|---|
| **L0 License** | কোম্পানি suspend বা cancel হলে লগইন আর API বন্ধ | আগে থেকেই ছিল |
| **L1 Company Menu Permission** | Super admin → কোম্পানি → module access। যে module কোম্পানির নেই, সেটা এখন **সার্ভারেই** কাউকে দেওয়া হয় না (আগে শুধু মেনু থেকে লুকাত)। Workspace আর Dashboard সবসময় থাকে। | বানানো |
| **L2 Role Menu Permission** | Role × module × ৭টা কাজ (Read, Create, Write, Delete, Publish, Export, Approve)। এক ইউজারের একাধিক role থাকতে পারে, আর role template আছে। | আগে থেকেই ছিল (page-wise নয়, module-wise) |
| **L3 User-wise permission** | User drawer → Access Rights → **Own permissions**। role থেকে আসা permission-এর ওপরে এই ইউজারকে আলাদা করে দেওয়া (+) বা কেড়ে নেওয়া (−) যায়। System Manager-এ খাটে না, আর নিজের permission নিজে বদলানো যায় না। | বানানো |
| **L4 Location Access** | ইউজারের warehouse তালিকা। আগে শুধু Sales আর PO-তে আটকাত, এখন Stock Transfer (পাঠানো বা গ্রহণ), Adjustment আর Count-এও আটকায়। Report-এর জন্য আলাদা অনুমতি (`IsReportAccess`) নেই: পড়া সীমিত নয়। | আংশিক |
| **L5 Accounts Permission** | User drawer → Access Rights → **Cash / bank accounts**। ইউজার শুধু টিক দেওয়া অ্যাকাউন্টগুলো দেখে, আর শুধু সেগুলো দিয়েই Collection, Payment, Settle, Voucher, Transfer আর Expense pay করতে পারে। Oner-এর মতো GL হেড ধরে নয়, cash/bank অ্যাকাউন্ট ধরে। | বানানো |
| **L6 Software Access Time** | নেই (পরের ধাপের জন্য রাখা) | বাকি |
| **§3.1 PasswordResetDays, IsResetPassword** | Workspace → Users → **Security**: পাসওয়ার্ডের মেয়াদ (দিন)। User drawer: "পরের লগইনে নতুন পাসওয়ার্ড দিতে হবে"। বদলানো না পর্যন্ত শুধু নতুন পাসওয়ার্ড দেওয়ার স্ক্রিন খোলে, আর সার্ভারও বাকি সব কাজ আটকায়। | বানানো |
| **§3.1 Change Password** | User menu → **Account security**। পাসওয়ার্ড বদলালে অন্য সব ডিভাইস থেকে সাইন আউট হয়। | বানানো |
| **§2.2 লগইন নিরাপত্তা** | পরপর ৫ বার ভুল পাসওয়ার্ড দিলে ১৫ মিনিট লক (সংখ্যা আর সময় বদলানো যায়)। admin আগেই খুলে দিতে পারে। প্রতিটা session-এর IP আর ডিভাইস রাখা হয়। "Sign out everywhere" আছে। | বানানো |
| **§3.8 EntryByApproveCancel** | Maker-checker: যে request পাঠায়, সে নিজে approve করতে পারে না। Approval-এর জন্য রাখা কাজেও এখন maker-এর নিজের cash/bank আর warehouse সীমা চেক হয়। | আছে |
| **§3.8 Approve-এ পাসওয়ার্ড** | নেই | বাকি |

**ইচ্ছা করে বানানো হয়নি:**
- Oner-এর আলাদা "Level" মাত্রা: againERP-তে role-ই যথেষ্ট।
- ~৩৭১টা page-wise menu code: againERP module-wise।
- Token-কে httpOnly cookie-তে নেওয়া (§2.2-এর সুপারিশ): পুরো auth flow বদলায়, তাই আলাদা কাজ হিসেবে রাখা।

### 19.4 Masters: Roadmap Phase 2 (§14)

| Roadmap Phase 2 | againERP-তে | অবস্থা |
|---|---|---|
| **৮. Customer আর Supplier: credit control** (§15.2, §15.11) | Sales order confirm-এর সময় (তখনই invoice issue হয়) এগুলো চেক হয়: (১) sales-এর জন্য locked customer কিনতে পারে না, এমনকি POS-এ নগদেও না; (২) cash-only customer-এর order-এ কিছু বাকি থাকলে confirm হয় না; (৩) ledger balance + এখনো invoice না হওয়া confirmed order + এই order-এর বাকি অংশ credit limit পার হলে আটকায়। Valid till পর্যন্ত বেশি conditional limit খাটে, আর limit ০ মানে কোনো সীমা নেই। Customer → Profile → Accounting-এ নতুন field: Sells on (Cash & credit / Credit / Cash only), Credit days, Conditional limit + Valid till, Security money, Opening date আর Sales lock (কারণসহ)। এখানে credit position-ও দেখায়: বাকি বা advance, open order, চালু limit আর কত বাকি আছে। | বানানো (ভাগ A) |
| Customer group / grade master | Sales → Pricing → **Customer groups**: group এখন server-এর master (৭টা built-in group আর customer-দের আগের code দিয়ে seed করা)। প্রতিটা group-এ default price type আর discount type দেওয়া যায়। Grade নেই, আর customer drawer এখনো browser-এর group list দেখায়। | আংশিক (ভাগ D) |
| LedgerLimit, ChequeDishonourBalance, AccountsId override | নেই | বাকি |
| **৬. Chart of Accounts-এর স্তর** (§16.2) | Account-এর tree যত খুশি স্তরের হতে পারে (depth দেখায়)। কোনো account-কে **Group** করা যায়, তখন তাতে সরাসরি post হয় না, তার child-এ হয়। System account (যেমন 6000) postable থাকে। Categorization table নেই: report-এর লাইন code-এর range দিয়ে ঠিক হয়। | আংশিক (ভাগ B) |
| **৬. Cash/Bank identification, Check Balance** (§16.3) | Payment account-এর ধরন (cash, bank, mobile) দিয়ে চেনা যায়। প্রতিটা account-এ **Check balance** দেওয়া যায়: তখন voucher, supplier payment, bill settle আর expense pay balance-এর বেশি টাকা বের করতে পারে না। Cheque head (1150/1160/2150) code-এ নির্দিষ্ট। | বানানো (ভাগ B) |
| **৬. Opening balance + finalize lock** (§16.2) | Finance → Accounting → **Opening balances**: GL opening draft batch হিসেবে রাখা হয়। **Finalize & post** করলে একটা journal post হয়, পার্থক্য যায় 3900 Opening Balance Equity-তে, আর batch lock হয়ে যায়। AR/AP আর cash/bank head-এর opening আসে customer, supplier আর payment account থেকে। Location অনুযায়ী opening নেই। | আংশিক (ভাগ B) |
| **৮. Bank → Branch → Account** | Finance → Payments → **Banks & branches**: ৬১টা bank আগে থেকে দেওয়া, branch-এ routing number। Bank account-এ bank, branch, account number আর title রাখা হয়, আর প্রতিটা নতুন bank account পায় 1010-এর নিচে নিজের GL (1011, 1012…)। | বানানো (ভাগ B) |
| **৯. Price/Discount Type → slab → Configuration** | Sales → Pricing: **Price types** (product-এর দাম, quantity slab আর তারিখসহ; Fixed অথবা lower/upper % limit), **Discount types** (product, brand বা category অনুযায়ী %, সাথে max % cap) আর **Pricing rules** (customer group, warehouse, salesperson, brand, category আর তারিখ মিললে কোন price type আর discount type খাটবে; সবচেয়ে বেশি শর্তের rule জেতে, তারপর priority)। দামের ক্রম: customer-এর নিজের দাম → rule বা group-এর price type → catalog দাম। Sales order form-এ product যোগ করলে দাম আর % discount নিজে বসে। Order আর quotation save-এর সময় limit পার হলে বা discount cap-এর বেশি হলে আটকায়। Quantity বা customer বদলালে আবার দাম আনে না। POS-এ আর "Configured Price Info" popup নেই। | বানানো (ভাগ D) |
| **৭. Product master** | (ভাগ C) **Not for selling** এখন sales order, quotation আর POS-এ আটকায়। Product-এ **Negative sales** tick দিলে company negative stock বন্ধ থাকলেও সেই product stock ছাড়া বেচা যায়। Track quantity বন্ধ product (IsStockMaintain) stock না নড়িয়ে বিক্রি হয়। Stock movement বা serial থাকলে **serial tracking বদলানো যায় না**। নতুন field: **Warranty days / Lifetime**, **Service warranty days**, **Return days** (return-এর সময় আটকায়) আর **HS code**। Product drawer-এ **Related / Spare** tab। **Unit type** আর **warehouse type** এখন server-এর master (unit-এ decimals আছে, ব্যবহার হওয়া unit মোছা যায় না)। বাকি: category অনুযায়ী GL head (sale-এ COGS posting নেই, revenue একটাই 4000 লাইন), ৩ স্তরের unit conversion, Dimension/Variant master, duty table। | আংশিক (ভাগ C) |

### 19.5 এখনো বাকি (spec থেকে)
- Collection/Payment-এ duty adjustment (DutyAdjLists) আর security deposit।
- "Against Bounced Cheque" mode (againERP-তে বাউন্স হলে ইনভয়েস আবার খুলে যায়, তাই সাধারণ payment দিয়েই settle হয়। দেখুন §11.6)।
- Day Book, Receive & Payment, Voucher Analysis রিপোর্ট (§16.8); Collection/Payment Analysis (§15.10)।
- Aging-এ Ledger Balance ধরে হিসাব (§15.8 `L`)। এখন Aged Receivable/Payable হয় প্রতিটা ইনভয়েস বা বিলের open balance ধরে, যা Oner-এর `N` (Net Outstanding)-এর মতো।
- Year-end close wizard আর opening finalize lock (§16.10)।

---

## 14. againERP-র জন্য প্রস্তাবিত Roadmap

**Phase 1 — Foundation**
1. Company, Location আর Warehouse; multi-currency (currency, exchange rate)
2. Security (§3.9): User, Level, Role, Menu tree (স্থায়ী code), Company menus, Role/User permission, Location access। লগইনের পরে permission map। সার্ভার-সাইড middleware।
3. Feature flags (§5)
4. Generic document lifecycle (§6): Draft, Pending, Approved, Cancelled; Edit before/after; approve-এ পাসওয়ার্ড; Reason; audit log; notification-এ pending সংখ্যা
5. ডকুমেন্টের নম্বর তৈরি (prefix, location, year, sequence)

**Phase 2 — Masters**
6. Chart of Accounts ৫ স্তরে, Cash/Bank identification, opening balance (location অনুযায়ী, finalize lock)
7. Product: hierarchy, Brand, Unit (৩ স্তরের conversion), **Dimension বা Variant**, Serial flag, Warranty, প্রোডাক্ট অনুযায়ী Accounts mapping, HS Code
8. Customer আর Supplier: credit control, ledger link। Bank → Branch → Account
9. Price/Discount Type → স্ল্যাব → Configuration

**Phase 3 — Core Transactions**
10. Direct Purchase, Purchase Return, Receive Finalize
11. Sales Order, Challan, Invoice; Direct Sales; Sales Return
12. Stock ledger: stock type (Current, RMA, Bad, WIP) × warehouse; serial ledger; Internal Transfer
13. Collection আর Payment: mode, mapping (bill-wise), duty adjustment। **Party ledger, Settlement, Outstanding আর Aging (§15)**
14. Auto-voucher তৈরি, তারপর Approve আর Posting

**Phase 4 — Differentiators**
15. Cheque Book Register আর Cheque Treatment (§11)
16. RMA পুরো চক্র (§7.4) আর Serial Search (§10)
17. Govt Duty (HS Code বা Location অনুযায়ী)
18. Trade Promotion, Commission/Funding

**Phase 5 — Reports আর বাকি**
19. Stock, Sales, Ledger, Outstanding, Trial Balance, IS, BS, Gross Profit
20. Report Design Config (print template), Label Caption override
21. Data Import (Excel), Bulk SMS, Software Access Time, Accounts Permission
22. HR/Payroll, Production, Lead (প্রয়োজন হলে)

**Oner-এর চেয়ে ভালো করার সুযোগ**: HTTPS আর নিরাপদ token (URL-এ নয়), একবারে সব feature ও permission পাঠানো, পড়া যায় এমন API নাম, Dr/Cr নিয়ম UI-তে কনফিগার করার ব্যবস্থা (posting rules টেবিল), আর চেক বা ভাউচারের সাথে স্পষ্ট লিংক (Oner-এ Payment থেকে আসা চেকের VoucherNo ফাঁকা থাকে)।
