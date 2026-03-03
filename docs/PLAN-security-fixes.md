# Project Plan: Security Fixes (ระบบเขียนคำร้องยืมคืนหุ่น/อุปกรณ์)

## 1. Overview
แผนงานนี้มุ่งเน้นการอุดช่องโหว่ความปลอดภัยระดับ High และ Medium จำนวน 3 ข้อหลักที่พบจากการ Audit โค้ด Phase 1 (Data Leakage, API Bypass, Missing Server-Side Validation) เพื่อให้ระบบมีความแข็งแกร่งพร้อมใช้งานจริงบน Production อย่างมั่นใจ

## 2. Project Type
**Security Patch (Database & Worker Proxy)**

## 3. Tech Stack
- PostgreSQL / Supabase PL/pgSQL
- Cloudflare Workers (Proxy & Rate Limiting)
- JavaScript (Frontend API calls)

## 4. Task Breakdown

### Task 1: Fix Data Leakage (Database View & RLS)
- **Agent:** `database-architect`
- **Priority:** P0 (Critical)
- **Goal:** ป้องกันไม่ให้ User นอกหรือ Hacker สามารถ Query เอาฟิลด์สถานะ, จุดประสงค์, หรือชื่อผู้ยืม ผ่านกระบวนการเช็ค Availability
- **Action Items:**
  1. สร้าง **Database View** (หรือ RPC `get_equipment_availability`) ที่ต่อข้อมูลจากตาราง `borrow_request_items` และ `borrow_requests` โดยคืนค่ากลับมาแค่ `(equipment_id, start_date, end_date, qty_borrowed)` 
  2. ยกเลิกการอนุญาตให้ Public อ่าน (Select) ตาราง `borrow_requests` โดยตรง (แก้ RLS Policy)
  3. ปรับแก้โค้ดฝั่ง Javascript (`borrow.js`) ให้เปลี่ยนไปเรียกใช้ View/RPC ตัวใหม่แทนการ Join แบบตรงๆ (`borrow_requests!inner(status)`)

### Task 2: Backend Anti-Hoarding Rules (RPC Hardening)
- **Agent:** `database-architect`
- **Priority:** P0 (Critical)
- **Goal:** ป้องกันการ Bypass กฎผ่าน API เพื่อเหมาจองหุ่นยนต์รวดเดียว 100 ชิ้น
- **Action Items:**
  1. อัปเดตโครงสร้างฟังก์ชัน RPC `submit_borrow_request` ใน Supabase
  2. เพิ่ม Logic ยืนยันสิทธิ์ผู้ยืมแบบ In-Database (เช่น เช็คยอดรวมคำร้อง `pending` ว่าต้องไม่เกิน 2 คำร้อง หรือชิ้นงานรวมในตะกร้าต้องไม่เกิน 5 ชิ้น)
  3. Lock การเกิด Race Condition ผ่าน `SELECT ... FOR UPDATE` อย่างรัดกุมก่อน `INSERT`
  4. หากผิดกฎ ให้ `RAISE EXCEPTION` เตะกลับไปยัง Frontend ทันที
  5. ให้ User (เจ้าของระบบ) เป็นคนยิง SQL Query อัปเดตขึ้น Supabase

### Task 3: Gateway Routing & Rate Limit (Cloudflare Worker)
- **Agent:** `backend-specialist`
- **Priority:** P1 (Important)
- **Goal:** บังคับให้การยิง API ทั้งหมดต้องผ่าน Cloudflare Worker เพื่อป้องกัน Bot และรับมือกับ DDoS
- **Action Items:**
  1. เพิ่ม Path ไปยัง Allowlist ของ `worker.js` (เช่น `/rpc/submit_borrow_request` และ `/rpc/get_next_available_date`)
  2. เปิดใช้งาน CORS เฉพาะกับโดเมนที่ได้รับอนุญาตอย่างเคร่งครัด
  3. ปรับแก้โค้ด `SUPABASE_URL` และ `SUPABASE_ANON` ใน `borrow.js` ให้ชี้มาที่ URL ของ Cloudflare Worker แทน (ซ่อน Supabase URL ของจริง)
  4. (Optional) ศึกษาและวางโครงสร้างการแปะ Turnstile Token ส่งมาให้ Worker ตรวจสอบก่อนส่งเข้า Supabase

## 5. Phase X: Verification Checklist
- [ ] RLS ทำงานอย่างถูกต้อง ไม่สามารถ Query อ่าน `borrow_requests` โดยตรงด้วย Anon Key ได้อีก
- [ ] หากลองยิง RPC `submit_borrow_request` ด้วย Postman ใส่ Qty = 10 ระบบต้องพ่น Error ทิ้งทันที (DB Level rejection) 
- [ ] กดขอคำร้องได้ตามปกติจากหน้าเว็บ, ระบบคิดวันและตัดสต๊อกถูกต้อง
- [ ] Network Tab ใน Browser ชี้ไปที่ Domain ของ Worker ไม่ใช่ URL ของ Supabase ตรงๆ 

---
*Created by: `project-planner` Agent*
