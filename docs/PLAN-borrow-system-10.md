# PLAN: Borrow System to 10/10

## Objective
ยกระดับระบบยืมอุปกรณ์จากสถานะปัจจุบัน (คะแนนรวม 5.8/10) ไปสู่ 10/10 โดยเน้น 4 แกน:
1. Functional correctness
2. Security and authorization
3. Reliability and observability
4. Testability and release quality

Target date: 6-8 weeks (แบ่ง rollout เป็น 3 ช่วง)

---

## Phase -1: Context Check

### Current Findings Baseline
1. ยกเลิกคำร้องจากหน้า `track.html` ใช้งานไม่ได้ (RLS block update)
2. Availability ฝั่งหน้า Borrow ไม่อิงช่วงวันจริง ทำให้ reject ตอน submit
3. มีหน้า tracking สองชุด (`track.html` vs `tracking.html`) ทำให้ behavior ไม่ตรงกัน
4. กฎ 24 ชั่วโมงถูก implement แบบ day-level (UTC date compare)
5. Edge case ใน tracking RPC response (`items` null) ยังไม่กันพัง
6. Automation test ยังไม่พร้อมรัน end-to-end ในเครื่อง

### Assumed Constraints
1. Stack หลักคงเดิม: Static frontend + Supabase + Cloudflare Worker
2. ทีมเน้นแก้แบบ incremental ไม่ rewrite ทั้งระบบ
3. ต้องไม่ทำให้ flow ผู้ใช้หยุดใช้งานระหว่างปรับปรุง

### Success Criteria (10/10 Definition)
1. Critical/High bug = 0 ใน production backlog
2. ทุก business rule สำคัญถูก enforce ที่ DB/RPC layer
3. E2E สำคัญผ่านอัตโนมัติ >= 95%
4. MTTR ของ incident หลัก < 30 นาที
5. ไม่มี endpoint สำคัญที่ bypass authorization/rate control ได้

---

## Phase 0: Socratic Gate (Planning Assumptions)

ก่อนลงมือจริง ให้ยืนยัน 5 คำถามนี้กับ Product Owner:
1. จะ deprecate `track.html` ทันที หรือคงไว้ชั่วคราวด้วย redirect?
2. นโยบาย cancellation ต้องการ "24 ชั่วโมงจริง" หรือ "ก่อนวันรับของ"?
3. อนุญาต guest tracking ต่อไปหรือบังคับ SSO ทั้งหมด?
4. SLA ที่ต้องการสำหรับหน้าหลัก Borrow และ Tracking คือเท่าไร?
5. ยอมรับ downtime migration ได้หรือไม่ (และหน้าต่างเวลาใด)?

หากยังไม่ตอบ ให้ใช้ default:
- Decommission `track.html` พร้อม redirect ไป `tracking.html`
- ใช้กฎ 24 ชั่วโมงจริง (timestamp-level)
- Guest tracking ได้ แต่ read-only ผ่าน RPC เท่านั้น
- Availability p95 < 1.5s
- Zero-downtime migration

---

## Architecture Decisions (ADR Summary)

### ADR-001: Single Public Tracking Surface
- Decision: เหลือหน้าเดียว (`tracking.html`) และใช้ RPC `get_borrow_request_status` เท่านั้น
- Trade-off: ต้องทำ redirect/compatibility layer ชั่วคราว
- Benefit: ลด logic ซ้ำและลดช่องโหว่จากการ query ตรงตาราง

### ADR-002: Server-Enforced Availability Contract
- Decision: frontend เรียก RPC/View สำหรับ availability ตามช่วงวันเสมอ
- Trade-off: เพิ่มงานฝั่ง DB/RPC และ caching
- Benefit: UI กับ DB validation ตรงกัน ลด false-positive booking

### ADR-003: State Change via RPC Only
- Decision: approve/reject/cancel/return เปลี่ยนสถานะผ่าน RPC เท่านั้น
- Trade-off: ต้องออกแบบ role checks และ audit fields เพิ่ม
- Benefit: ปิดช่อง update ตรง table และบังคับ business rules กลาง

### ADR-004: Quality Gate in CI
- Decision: เพิ่ม lint + unit + integration + E2E blocking ก่อน deploy
- Trade-off: build time นานขึ้น
- Benefit: ลด regression และเพิ่มความมั่นใจ rollout

---

## Work Plan (Task Breakdown)

## Phase 1 (Week 1-2): Critical Stabilization
Goal: ปิด Critical/High ที่กระทบ production ทันที

1. Tracking consolidation
- Redirect `track.html` -> `tracking.html`
- ลบ/disable script ที่ query `borrow_requests` ตรงจาก client
- Hardening `tracking.js` ให้รองรับ `items = null/[]`

2. Cancellation flow redesign
- เพิ่ม RPC `cancel_borrow_request` (auth + ownership + status + cutoff check)
- UI เรียก RPC เท่านั้น และแสดง error class ที่ชัดเจน
- ปรับกฎเวลาเป็น timestamp-based 24 ชั่วโมง

3. Quick security hardening
- ตรวจทุกหน้า frontend ว่าไม่มี direct table mutation ที่ไม่จำเป็น
- อัปเดต allowlist ใน worker (RPC-only paths)

Exit criteria:
- ผู้ใช้ยกเลิกได้ตามกฎจริง
- ไม่มีหน้าไหนพยายาม update table ตรงที่ RLS block
- No Critical bug open

---

## Phase 2 (Week 2-4): Domain Correctness & Data Integrity
Goal: ความถูกต้องของคิว/stock และสถานะต้อง deterministic

1. Availability API redesign
- สร้าง RPC/View กลางสำหรับ availability ตามช่วงวันที่เลือก
- รวม logic overlap และสถานะ request ที่ lock stock
- เพิ่ม index/query tuning ตาม pattern overlap

2. Borrow submit contract hardening
- Validate payload schema ที่ RPC boundary
- ตรวจ qty, duplicate equipment, max items, date window ที่ DB
- ส่ง error code มาตรฐานให้ frontend แปลผลได้ตรง

3. Transaction and concurrency tests
- ทดสอบ concurrent submit กรณีอุปกรณ์เดียวกัน
- ยืนยันไม่มี oversell ใน race condition

Exit criteria:
- UI availability ตรงกับผล submit จริง
- oversell = 0 ใน concurrent tests
- business rule หลักอยู่ที่ DB/RPC ครบ

---

## Phase 3 (Week 4-6): Reliability, Observability, and Ops
Goal: ตรวจจับและแก้ปัญหาได้เร็ว พร้อม rollback ปลอดภัย

1. Structured logging and tracing
- ใส่ request_id/tracking_id ใน log pipeline
- แยก log level: user error vs system error

2. Monitoring and alerting
- Dashboard: error rate, RPC latency, submit success ratio
- Alert policy: latency spike, RPC failure burst, auth anomaly

3. Runbook and incident workflow
- สร้าง incident playbook (triage, mitigation, rollback)
- ซ้อม rollback migration และ feature-flag fallback

Exit criteria:
- มี dashboard ครบ flow สำคัญ
- alert-to-ack < 10 นาที
- rollback drill ผ่าน

---

## Phase 4 (Week 6-8): QA Excellence and Release Governance
Goal: ทำให้ regression หลุด production ยากมาก

1. Test pyramid
- Unit tests: rule helpers/date cutoff/parser
- Integration tests: RPC contracts + RLS expectations
- E2E tests: login -> select date -> add cart -> submit -> tracking -> cancel

2. CI/CD quality gates
- Blocking checks: lint, type, unit, integration, E2E smoke
- Preview deploy + production canary + auto rollback guard

3. Non-functional verification
- Security scan (dependency + config + policy checks)
- Load profile on borrow/tracking endpoints

Exit criteria:
- Coverage ของ critical path >= 90%
- E2E critical suite pass >= 95%
- release checklist ผ่าน 100%

---

## Agent Assignments

1. `project-planner` (lead): แตกงานเป็น sprint/story + dependency graph
2. `database-design`: RPC contract, migration strategy, indexing
3. `api-patterns`: error contract, auth boundary, rate limiting
4. `webapp-testing`: integration/E2E suite + CI runners
5. `deployment-procedures`: rollout/canary/rollback process
6. `vulnerability-scanner`: security verification and policy audit

---

## Milestones and Scoring Ladder

1. Milestone A (End Week 2): 7.5/10
- Critical fixed, tracking consolidated, cancel via RPC

2. Milestone B (End Week 4): 8.8/10
- Availability correctness aligned UI/DB, concurrency-safe

3. Milestone C (End Week 6): 9.5/10
- Observability + incident readiness completed

4. Milestone D (End Week 8): 10/10
- Full quality gates, high pass-rate E2E, zero high-severity backlog

---

## Verification Checklist (Definition of Done)

- [ ] ไม่มี direct client mutation ที่ข้าม RPC contract
- [ ] RLS และ role checks ถูกทดสอบทั้ง happy/fail paths
- [ ] Availability result deterministic กับ submit validation
- [ ] กฎยกเลิก 24 ชั่วโมงทดสอบครบ timezone edge cases
- [ ] CI quality gates บังคับก่อน merge/deploy
- [ ] Monitoring + alert + runbook พร้อมใช้งานจริง
- [ ] Canary and rollback verified
- [ ] Post-release review ยืนยันคะแนนรวมแตะ 10/10

---

## Risk Register (Top 5)

1. Migration logic clash กับข้อมูลเดิม
- Mitigation: dual-read phase + reversible migration

2. UI change สร้าง friction ผู้ใช้
- Mitigation: staged rollout + user messaging + fallback

3. Test flakiness ใน E2E
- Mitigation: deterministic fixtures + retry strategy + smoke split

4. Performance regression จาก validation เพิ่ม
- Mitigation: index tuning + query plan review + caching

5. Incomplete ownership/rbac model
- Mitigation: explicit role matrix + policy tests in CI

