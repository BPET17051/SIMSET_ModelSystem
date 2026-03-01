# Project Plan: Equipment Borrowing System (ระบบเขียนคำร้องยืมคืนหุ่น/อุปกรณ์)

## 1. Overview
ปรับปรุงจากหน้าระบบ Catalog เดิม (สำหรับดูข้อมูล) ให้กลายเป็น **"ระบบเขียนคำร้องยืมคืนหุ่น/อุปกรณ์"** แบบครบวงจร โดยมีจุดประสงค์เพื่อให้ผู้ใช้งานภายในหน่วยงานสามารถทำรายการยืม-คืนหุ่น/อุปกรณ์ทางการแพทย์ได้อย่างเป็นระบบ และสามารถระบุสต๊อกคงเหลือจริงได้อย่างแม่นยำ เพื่อลดความซ้ำซ้อนของการจอง

## 2. Project Type
**WEB** (Frontend: HTML/CSS/JS, Backend: Supabase/Apps Script)

## 3. Success Criteria
1. **Real-time Inventory (Premium Shopping Cart Experience):**
   - **UX/UI Design:** ออกแบบให้สวยงามทันสมัย (Modern E-commerce UX) มีระบบตะกร้าสินค้า (Cart System), ภาพประกอบชัดเจน, ปุ่ม Add to Cart ที่เข้าถึงง่าย, และ Sticky Checkout Bar ให้อารมณ์เหมือนกำลังช้อปปิ้งออนไลน์
   - **Date Range Availability:** ผู้ใช้งานต้องเลือก "วันรับของ" และ "วันคืนของ" ก่อนระบบจะคำนวณจำนวนคงเหลือในช่วงเวลานั้น โดยระบบจะล็อกกติกา **(DATE-only)** คือสนใจแค่วันที่ ไม่ระบุชั่วโมง (Full-day Accounting)
   - ระบบเช็คการชนกันของวันที่ (Date Conflict) จากคำร้องอื่น แทนการตัด Stock รวมทิ้งทั้งระบบ
   - การนับวันทับซ้อน (Overlap Logic) ให้นิยามแบบ **Inclusive ทั้งวันยืมและวันคืน** ตัวอย่างเช่น ยืมวันที่ 1-3 และ ยืมวันที่ 3-5 ถือว่า **ชนกันวันที่ 3** (จองไม่ได้) ต้องเป็น 1-2 และ 3-5 ถึงจะจองได้
   - **Timezone & Date Format:** ฝั่ง Client ส่งค่าแบบ `YYYY-MM-DD` เป็นสตริง แต่ในฐานข้อมูล Postgres **บังคับใช้ชนิดข้อมูล `DATE`** เพื่อให้คำนวณวันและใช้งาน Index ได้ลึกที่สุดโดยไม่ต้องเจอปัญหา Timezone shift (เกิดกับ timestamp)
   - **Turnaround Buffer & Exclusive Availability Logic:** นิยามคณิตศาสตร์ของความว่างให้ตรงกันคือ `effective_end_date = end_date + buffer_days` แล้วนำไปใช้เช็ค Inclusive Overlap (เช่น buffer 1 วัน: ยืม 1-3 -> effective 1-4 -> คิวถัดไปจองได้วันที่ 5)
   - สินค้า 1 ชิ้น สามารถถูกจองได้หลายคน ตราบใดที่วันที่ไม่ทับซ้อน (Overlap) กัน
   - **Status & Availability Impact:** สถานะจะถูกแบ่งออกเป็น 2 ระดับอย่างชัดเจนเพื่อป้องกันข้อมูลขัดแย้ง (Data Inconsistency) เมื่อมีการคืนบางส่วน:
     - **Header Level (`borrow_requests.status`):** คุมแค่รอบของเอกสาร (`pending|approved|rejected|cancelled|returned_pending_inspection|returned|expired`)
     - **Item/Unit Level (`borrow_request_items` & `equipment_units`):** คุมสภาพของทรัพย์สิน หากมีการชำรุดหรือส่งซ่อม สถานะทรัพย์สินจะไม่กระทบเอกสารรวม 
   - **Damage Tracking & Partial Return (Item Level):** เมื่อส่งของคืน Admin จะปรับคำร้องเป็น `returned_pending_inspection` จากนั้นจะทำการเช็คสภาพรายชิ้น สำหรับการยืมแบบระบุจำนวน (Quantity) จะมีการหักลบยอดผ่านฟิลด์ `qty_borrowed`, `qty_returned_ok`, `qty_returned_damaged`, `qty_returned_maintenance` โดยต้องตรวจสอบว่าผลรวมการคืนไม่เกินยอดยืม
2. **Frictionless Form with Secure Identity (OIDC):**
   - ใช้ระบบ Single Sign-On ผ่าน **Google Workspace หรือ Microsoft Entra OIDC** พร้อมทำ **Domain/Tenant Restriction** (อนุญาตเฉพาะอีเมลขององค์กร/โรงพยาบาลเท่านั้น)
   - ลดภาระผู้ยืม: ระบบจะดึง "ชื่อ-นามสกุล" และ "อีเมล" มากรอกลงฟอร์มให้อัตโนมัติ (ลดข้อผิดพลาดในการพิมพ์)
   - ข้อมูลอื่นๆ ยังคงกรอกง่ายเหมือนเดิม: ตำแหน่ง, ภาควิชา/หน่วยงาน (Dropdown เพื่อป้องกันการสะกดผิด), จุดประสงค์(ย่อ), เบอร์โทร, สถานที่ใช้งาน, วันที่ยืม, วันที่คืน
3. **Approval Workflow & Tracking:**
   - สถานะเริ่มต้นของคำร้องคือ "รออนุมัติ" (Pending)
   - ทีม Admin ทำการตรวจและกด "อนุมัติ" (Approved) ในระบบหลังบ้าน
   - **Secure Document Generation:** เมื่ออนุมัติ ระบบจะสร้างเอกสารด้วย **Server-Side PDF Generation** เป็นหลัก
     - **Document Number Format & Atomic Issuing:** กำหนดกระบวนการออกเลขที่เอกสาร (เช่น `SIM-202602-001`) แบบ Atomic พร้อมรับประกันไม่ซ้ำด้วย Unique Index 
     - **Document Revision Policy:** ห้ามแก้ไขทับเอกสารเดิม หากมีการอัปเดต ต้องสร้างข้อมูลลงตาราง `document_artifacts` แล้วชี้ Revision ใหม่ ป้องกันการปลอมแปลง
   - ระบบมีรหัสติดตาม (Tracking ID) **เป็นโทเคนสุ่ม 128-bit อัลกอริทึมเข้ารหัส (Secure Random Token)** ไม่ใช่ UUID ธรรมดาหรือเลขรัน เพื่อป้องกันการ Brute Force 100%
   - การติดตามสถานะ (Tracking) **บังคับให้ Login เพื่อดูข้อมูล** (ไม่อนุญาตให้ Public ดูข้อมูลส่วนตัว) 
   - หน้าตรวจสอบเอกสาร (Public QR Verify) มีการ **Sanitize Policy (เซ็นเซอร์ข้อมูลส่วนบุคคล)** อัตโนมัติ: โชว์เฉพาะรหัสเอกสาร, ยี่ห้อ/รุ่น, เวลา, และสถานะ ห้ามโชว์ชื่อเต็มหรือเบอร์โทรผู้ยืมเด็ดขาด
4. **Analytics Ready & Audit Trail:**
   - ฐานข้อมูลถูกออกแบบมาให้ตอบคำถาม: หน่วยงานไหนยืมบ่อยสุด? ยืมไปทำอะไร? ยืมใช้นานเท่าไหร่? 
   - บันทึกอีเมล (Email) ของผู้ยืมไว้เป็น Audit Trail เสมอเพื่อความมั่นใจของโรงพยาบาล

## 4. Tech Stack (Current System)
- **Frontend:** Vanilla HTML, CSS (Tailwind), JavaScript
- **Backend / Database:** Supabase (PostgreSQL), Google Apps Script (Integration)
- **Hosting:** Cloudflare Pages (simset-modelsystem.pages.dev)

## 5. File Structure
การปรับปรุงจะกระจายอยู่ตามโฟลเดอร์โครงการ ดังนี้:

```text
/website/
 ├── index.html           # หน้า Catalog ปัจจุบัน -> เปลี่ยนเป็นหน้าระบบจองพร้อมแสดงจำนวน
 ├── tracking.html        # [NEW] หน้าสำหรับกรอก Tracking ID เพื่อดูสถานะ และปริ้นท์เอกสาร
 ├── js/
 │   ├── catalog.js       # Logic โหลดข้อมูล + ตัดสต๊อกชั่วคราว + ส่งฟอร์ม
 │   └── tracking.js      # [NEW] Logic สำหรับเช็คสถานะและสร้างหน้าเอกสาร (PDF/Print)
 └── admin/
     ├── dashboard.html   # หน้า Admin ปัจจุบัน (เพิ่ม Widget หรือ Tab สำหรับ "คำร้องรอดำเนินการ")
     ├── requests.html    # [NEW] หน้า Admin สำหรับจัดการ Approve/Reject และรับเคลียร์สถานะคืน
     └── js/
         └── requests.js  # [NEW] Backend logic ของ Admin (Approve -> Gen Doc No. -> Restore Stock)
```

## 6. Task Breakdown

### Task 1: Database Schema Update (Inventory & Requests)
- **Agent:** `database-architect`
- **Skills:** `database-design`
- **Priority:** P0 (Foundation)
- **Input:** โครงสร้างตารางปัจจุบันใน Supabase
- **Output:**
  1. โครงสร้างอุปกรณ์ (`equipments`): แยกลอจิกการนับ
     - **แบบ Quantity (นับจำนวน):** สำหรับอุปกรณ์ทั่วไป มี `total_quantity` และ `maintenance_quantity`
     - **แบบ Serial/Unit (รายตัว):** สร้างตาราง **`equipment_units`** เป็น Master Table เก็บสถานะและ Serial ฝูกกับ `equipments`
   2. สร้างตารางแบบ Relational (1-to-Many) เพื่อรองรับ 1 คำร้องยืมหลายรายการ
     - `borrow_requests` (Header: ข้อมูลผู้ยืม, สถานะ **เพียงแค่ `pending|approved|rejected|cancelled|returned_pending_inspection|returned|expired`**, `tracking_id` 128-bit, `document_no` (Unique), `current_revision_id`, `cancel_reason`, `cancelled_at`)
     - **`document_artifacts`** (Audit History: `id`, `request_id`, `pdf_url`, `pdf_hash`, `revision_no`, `created_at`)
     - `borrow_request_items` (Detail: `request_id`, `equipment_id`, `unit_id`, `start_date`, `end_date`, **`qty_borrowed`, `qty_returned_ok`, `qty_returned_damaged`, `qty_returned_maintenance`**)
     - **`notification_logs`** (Email Audit: `id`, `request_id`, `recipient_email`, `status` (success/failed), `type` (approved/rejected), `retry_count`, `sent_at`, `error_message`)
     - **Constraint:** `expired` เกิดขึ้นเฉพาะกับ `pending` เท่านั้น, ถ้ากำหนด `unit_id` บังคับยอดคงเหลือ `qty_*` สะสมต้องเป็น 1 เสมอ
     - เพิ่มฟิลด์ `expires_at` เพื่อเก็บเวลาหมดอายุของสถานะ pending ใน Header
     - **Performance & Composite Indexing:** เพื่อให้ Overlap Query เร็วที่สุดเมื่อมีข้อมูลมหาศาล บังคับสร้าง **Composite Index:** `(equipment_id, start_date, end_date)` ในตาราง `borrow_request_items` และ Filter เฉพาะสถานะ Request ที่ Active
  3. **สร้าง SQL Functions เพื่อบริการ Client-side**
     - **`rpc('submit_borrow_request')`**: อิงโครงสร้างเพื่อประสิทธิภาพสูงสุดและรวบเป็น Transaction เดียว (Atomic)
       - **Locking:** ล็อกแถวใน `equipment_units` หรือ `equipments` ที่เกี่ยวข้องด้วย `SELECT ... FOR UPDATE` เพื่อป้องกัน Race Condition (Double Booking)
       - **Validation:** คำนวณ Availability สมบูรณ์แบบด้วย `effective_end_date` โดยนับยอดจาก `borrow_request_items` (สนใจสถานะที่ไม่ใช่ `cancelled` หรือ `expired`)
       - **Insertion:** Insert ทั้ง Header และ Items ในรอบเดียว พร้อมตรวจสอบผลรวมการใช้ (Partial return schema)
       - **Error Handling:** หากของไม่พอ `RAISE EXCEPTION` เพื่อ Rollback อัตโนมัติ
     - **`rpc('get_next_available_date')`**: (สำหรับ Zero-Stock UX) รับค่า `equipment_id, start_date, end_date, qty` แล้วให้ DB วนหาและโยนวันที่ว่างที่ใกล้ที่สุดกลับมาให้ (จำกัดการค้นหาล่วงหน้าไม่เกิน 180 วัน ป้องกัน Query ค้าง)
     - Gen 128-bit Tracking ID คืนให้ Frontend โดยไม่ผ่านฝั่ง Client
  4. สร้าง Scheduled Job **โดยใช้ Google Apps Script (GAS) Time-driven Trigger เป็นตัวหลัก** และมี `pg_cron` เป็น Backup ในกรณีที่ระบบหลักมีข้อจำกัด ตรวจสอบ `expires_at` แบบอัตโนมัติ เพื่อเคลียร์สล็อตคนที่จองค้างไว้
- **Verify:** ปิด Table Insert ใน RLS ลอง Insert ผ่าน API ปกติต้อง Error (โดนบล็อก) ต้องเรียกผ่านหน้าต่าง RPC function เท่านั้นถึงจะได้ผลลัพธ์ Tracking ID

### Task 2: Frontend Catalog & Request Form
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`
- **Priority:** P1
- **Dependencies:** Task 1
- **Input:** `website/index.html`
- **Output:**
  1. ออกแบบหน้า Catalog ใหม่ให้เป็น **Premium E-commerce UI** (ใช้โครงสร้างจาก `website/index.html` เดิมแต่อัปเกรดความสวยงามและการโต้ตอบ)
  2. เพิ่ม **Cart System** (ตะกร้ายืม): กดเพิ่มลงตะกร้า, มี Badge จำนวนของ, และมีหน้าสรุปตะกร้าก่อนกดยืนยัน (Checkout)
     - **Cart Conflict Handling:** หากมีการเบียดคิวกันตอนกดยืนยัน (Race condition) หรือมีของบางชิ้นไม่ว่าง **ห้าม Reject ทิ้งทั้งตะกร้า** ให้ระบบทำไฮไลต์สีแดงเฉพาะ Item ที่มีปัญหา พร้อมปุ่ม "Remove unavailable items" เพื่อให้ User ไปต่อกับของชิ้นอื่นได้ทันที
  3. เพิ่ม **Date Picker Calendar View** (ให้เลือก วันที่ยืม - วันที่คืน) ก่อนถึงจะโชว์จำนวนหุ่นที่ว่างในช่วงนั้น 
     - **Pre-View Availability Matrix:** ก่อนหรือระหว่างเลือก ให้มีหน้าตาราง (Matrix) สรุปภาพรวมความว่างของอุปกรณ์หลักทั้งหมดเทียบกับวันที่ (เช่น แนวนอนเป็นวันที่ 1-6, แนวตั้งเป็นชื่ออุปกรณ์ CPR, ALS, DIFE) เพื่อให้ User เห็นภาพรวมก่อนวางแผนหยิบใส่ตะกร้า ลดการคลิกย้อนกลับไปมา
     - **Buffer Day UI:** ในหน้าปฏิทิน ต้องมีข้อความคงที่ชัดเจน เช่น "ระบบมีวันตรวจเช็ค/ทำความสะอาด 1 วันหลังคืนของ" และเมื่อเลือกวันแล้ว ให้ระบบ Auto-highlight วัน Buffer เป็นสีจางๆ ให้เห็นภาพ
     - **Checkout Summary:** หน้าสรุปก่อนกดยืนยันต้องบอกชัดเจน เช่น "คืนวันที่ 3 → ว่างให้จองอีกครั้งวันที่ 5" เพื่อความเคลียร์
     - **Calendar Performance:** ปฏิทินต้องโหลดทันที (ห้ามหมุน 3 วินาที) โดยบังคับ **Pre-fetch** ข้อมูล Availability เป็นก้อน 60 วัน และถ้าเลื่อนเดือน ให้โหลดเพิ่มทีละ 30 วันแบบ Cache (ห้ามยิงซ้ำถ้ามี Data เดิม)
     - **Zero-Stock UX:** หากอุปกรณ์ในวันนั้นเต็มแล้ว ไม่เพียงแค่ทำให้ปุ่มเป็นสีเทากดไม่ได้ แต่ต้องมีข้อความบอก **"ว่างอีกครั้งวันที่..." (Next available date)** เพื่อให้ User เปลี่ยนแผนการยืมได้ทันทีโดยไม่ต้องเดาสุ่ม
  4. เพิ่มปุ่ม "Sign in with Google / Microsoft" (ดึงชื่อ-อีเมลมาแสดง) ให้ Login ก่อนกดจอง พร้อมจำกัด Domain ควบคู่
  5. สร้าง Modal / Form กรอกคำร้อง พร้อม **ฝังตัวยืนยัน reCAPTCHA (หรือ Cloudflare Turnstile) โดยต้องมีการตรวจสอบ (Verify) พฤติกรรมฝั่ง Server-side ผ่าน Edge Function หรือ RPC** ด้วย
  6. ผูก API ส่งข้อมูลไปหาฟังก์ชัน `rpc('submit_borrow_request')` ของ Supabase (รองรับ Array ของ items)
- **Verify:** ไม่ผ่าน CAPTCHA ต้องกดส่งไม่ได้, ส่งฟอร์มสำเร็จแล้วได้ 128-bit Tracking ID กลับมาแสดง

### Task 3: Public Tracking & Automated Document Generation
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`
- **Priority:** P1
- **Dependencies:** Task 2
- **Input:** Flow แจ้งสถานะแก่ผู้ยืม
- **Output:**
  1. สร้างหน้า `website/tracking.html`
  2. ให้ผู้ใช้ค้นหา Tracking ID ระบบจะดึงข้อมูลจาก Supabase มาแสดงสถานะ
     - **ระบบบังคับ Login สำหรับหน้า Tracking** เพื่อความเป็นส่วนตัว
     - ขา Public QR Verify ตัองมี Rate Limiting และการทำ Data Sanitization (เซ็นเซอร์ข้อมูลส่วนบุคคล)
  3. **ฟังก์ชันสร้างเอกสารที่ปลอดภัย (Secure Document Generation):**
     - สร้าง PDF ฝั่ง Server โดยส่ง Webhook ไปยัง Google Apps Script (GAS) 
     - **GAS Optimization:** เพื่อหลีกเลี่ยงข้อจำกัดโควตาเวลา (6 นาที/รัน) แนะนำให้ใช้ **Google Doc Template** แล้วสั่ง `replaceText` ค่าต่างๆ ลงไป จากนั้นค่อยใช้คำสั่ง `getAs(MimeType.PDF)` ซึ่งจะเร็วกว่าการสั่งวาด PDF ใหม่ตั้งแต่ต้น
     - **แผนสำรอง:** เตรียมโครงสร้างเผื่อใช้ Edge Function หรือ Client-side library (เช่น jsPDF) ไว้ในอนาคต หากพบปัญหาคอขวดบนฝั่ง GAS (Quota Limit)
     - ระบบสร้างแถวใหม่ใน **`document_artifacts`** เก็บ `pdf_url` และ `pdf_hash` เข้ารหัส SHA-256 และชี้ไปที่ `borrow_requests.current_revision_id`
     - **Regenerate Audit:** หาก Admin ต้องอัปเดตเอกสาร ต้องเพิ่มบรรทัดใหม่ลงใน `document_artifacts` (ห้ามทับของเดิม) เพื่อเก็บประวัติตรวจสอบได้
     - ฝัง **QR Code** บนหน้า PDF ที่สแกนแล้ววิ่งไปหน้า Public Verify URL ที่โชว์ ข้อมูลอ้างอิงและ Hash **(Sanitized Info)** เพื่อยืนยันว่าเป็นไฟล์ตัวจริง
  4. **Email Notification (Webhook):** เพิ่มระบบแจ้งเตือนทางอีเมลแบบ **Idempotent** (ป้องกันการส่งซ้ำ) พร้อมบันทึกลงตาราง `notification_logs`
     - **ข้อความสั่งงาน Jr.dev (Strict Rules):**
       - "ระบบต้องส่งอีเมลจากเมลกลางศูนย์ (single sender)"
       - "ส่งอีเมลแค่ 2 กรณี: `Approved` หรือ `Rejected` เท่านั้น" (ห้ามส่งตอน Pending ถือเป็นคอขวดเปล่าๆ)
       - "**Approved email** = รวม 'อนุมัติแล้ว' + 'เอกสารพร้อมดาวน์โหลด' ในฉบับเดียว และส่งได้ก็ต่อเมื่อสร้าง PDF สำเร็จ + บันทึก `document_artifacts` แล้วเท่านั้น"
       - "**Rejected email** = แจ้งปฏิเสธ + ระบุข้อความเหตุผล (cancel_reason)"
       - "เพิ่มตาราง `notification_logs` เพื่อให้ Admin ตรวจได้ว่าเคยส่งให้ใคร เมื่อไร สำเร็จ/ล้มเหลว"
       - "ห้ามส่งซ้ำอัตโนมัติ ต้อง **idempotent** และถ้าล้มเหลวให้ retry จำกัดครั้ง + มีปุ่ม **Resend** ให้ Admin ในหน้าหลังบ้านด้วย"
  5. ปุ่ม "ดาวน์โหลดเอกสาร" อนุญาตให้เข้าถึงเฉพาะ Role ผู้ยืมคนนั้นๆ และ Admin
- **Verify:** ใส่ Tracking ID แล้วดึงข้อมูลถูกต้อง, กดดาวน์โหลด/Print แล้วได้หน้าตาเอกสารที่จัด Layout สมบูรณ์บน A4 และมีกลไกป้องกันการปลอมแปลง (QR Code/Server PDF)

### Task 4: Admin Approval & Tracking Management
- **Agent:** `backend-specialist` & `frontend-specialist`
- **Skills:** `clean-code`, `frontend-design`
- **Priority:** P2
- **Dependencies:** Task 1
- **Input:** `website/admin/`
- **Output:**
  1. สร้าง UI เมนู "คำร้องยืมคืน" ใน Dashboard โดยมีอารมณ์แบบ **Task Queue**
     - **Admin Widgets:** ต้องมี Widget สรุปงานรายวัน เช่น "Pending วันนี้ (ต้องอนุมัติ)", "คืนรอตรวจ (returned_pending_inspection)", และ "ใกล้ถึงวันรับของพรุ่งนี้" เพื่อป้องกัน Admin หลุดโฟกัส
  2. ระบบสามารถให้ Admin เลือก Approve (สร้างหมายเลขเอกสารอ้างอิงส่งกลับไป) หรือ Reject
     - **ปุ่มจบงานแบบ Safe (Safe Actions):** 
       - เมื่อ Approve แล้ว UI ต้องโชว์ชัดเจนว่า "ส่งอีเมลสำเร็จแล้ว" และถ้า Failed ต้องมีปุ่ม "Resend Email" ให้กดซ้ำได้ทันที
       - เมื่อ Reject ทิ้ง ต้องมี Modal ให้เลือก **"เหตุผลการไม่อนุมัติ" (Dropdown list)** ที่เจอบ่อยๆ (เช่น ของไม่พอ, ข้อมูลไม่ครบ) + ช่อง Free text ให้พิมพ์เพิ่มได้
  3. **ระบบรับคืนและตรวจเช็คสภาพ (Damage Tracking & Partial Return):**
     - สร้างปุ่ม "รับคืน (รอกตรวจสอบ)" -> คำร้อง (Header) จะเปลี่ยนสถานะเป็น `returned_pending_inspection`
     - **การคืนบางส่วน (Partial Return & Damage Tracking):** ระบบจะแตกรายการออกมาเป็นรายชิ้น (Item-level) Admin ต้องระดมตรวจสอบแต่ละชิ้น
       - **Admin UX & Error Prevention:** ห้ามให้ Admin พิมพ์ตัวเลขเองทั้งหมด (เสี่ยง Human Error)
         - ต้องมีปุ่ม **"คืนครบทั้งหมด" (Return All)** หรือ **"ส่งซ่อมทั้งหมด" (Maintenance All)** เพื่อ Auto-fill ตัวเลข `qty_borrowed` ลงช่อง `qty_returned_ok` หรือ `qty_returned_maintenance` ทันที
         - หากพิมพ์เอง ระบบต้อง Auto-calc ส่วนต่างไม่ให้ผลรวมเกินยอดที่ยืมไป
       - ชิ้นไหนปกติ: หยอดลง `qty_returned_ok` เพื่อให้ Stock ของชิ้นนั้นเข้าระบบคืนทันที
       - ชิ้นไหนชำรุด/ซ่อม: หยอดลง `qty_returned_damaged` หรือ `qty_returned_maintenance` (ปรับ `unit_status` สำหรับแบบ Serial)
     - เมื่อคืนครบทุกชิ้นแล้ว (ผลรวม `qty_returned_*` == `qty_borrowed`) ปุ่มถึงจะให้จบงานและเปลี่ยนสถานะ Header เป็น `returned`
- **Verify:** Admin กดรับคืนปกติแล้ว Stock กลับมาโชว์ให้คนจองต่อได้, หากกดส่งซ่อม Stock ของหุ่นประเภทนั้น Availability ต้องลดลง 1 เสมอในทุกช่วงเวลา

### Task 5: Reports & Analytics Dashboard (Admin)
- **Agent:** `frontend-specialist`, `backend-specialist`
- **Skills:** `performance-profiling`, `database-design`
- **Priority:** P1 (สำหรับ KPI พื้นฐาน) / P3 (สำหรับ Report เชิงลึก)
- **Dependencies:** Task 4
- **Input:** ตาราง `borrow_requests`, `borrow_request_items`
- **Output:** 
  1. **Phase 1 (Basic Executive KPIs):** หน้า Dashboard แรกสุดของ Admin ต้องมีตัวเลข 4 ตัวนี้โชว์เสมอ (ยิง Query ทีเดียวจบ):
     - **อัตราการจองสำเร็จ (% Approved):** เทียบจากคำร้องทั้งหมด
     - **อัตราการยกเลิก (% Cancelled/Rejected):** เพื่อดูว่ามีปัญหาของไม่พอหรือคนกดยกเลิกบ่อยแค่ไหน
     - **Average Lead Time:** ค่าเฉลี่ยว่าคนจองล่วงหน้ากี่วัน (หาค่าเฉลี่ยของ `start_date - created_at`)
     - **Top/Peak Usage:** หุ่นตัวไหนถูกยืมบ่อยสุดในเดือนนี้ (Top Equipment)
  2. **Phase 2 (Deep Analytics):** เพิ่มกราฟแท่ง/พาย หรือตารางสรุปรายภาควิชา, รายปี, หรือ Export เป็น Excel
- **Verify:** ดึงข้อมูลจัดกลุ่ม Aggregate ได้ถูกต้องตรงกับข้อมูลจริงแม้ข้อมูลจะมีเป็นหมื่น Row (ต้องใช้ Index ช่วย)

## 7. ข้อควรระวังและการวิเคราะห์ความเสี่ยงเชิงลึก (Deep Risk Analysis)

1. **System Complexity & Dev Capability Risk (ความเสี่ยงด้านขีดความสามารถของทีม):** 
   - ระบบนี้มีการจัดการ State ที่ซับซ้อน (Date overlap, Partial Return, Idempotent Email, Transactional Locking) 
   - **ความเสี่ยง:** การหา Developer หน้างานที่เข้าใจ Race Condition และการเขียน RPC/PostgreSQL ระดับลึกเพื่อมา Maintain หรือเพิ่มฟีเจอร์ในอนาคตนั้น "ยากมาก"
   - **Mitigation:** ผลัก Business Logic ทั้งหมดที่มีผลต่อ Transaction ไปเก็บไว้ในระดับ DB (Supabase RPCs) เพื่อให้โค้ดฝั่ง Frontend (React/Vue/HTML) "โง่" ที่สุด ทำให้ Junior Devs สามารถเข้ามาสืบทอดงาน UI/UX ได้โดยไม่ทำระบบพัง
2. **Performance & Database Overload Risk:**
   - การหา "ช่วงเวลาว่าง" (Availability) ต้องทำ Range Overlap Scan ข้ามตาราง `borrow_request_items` ที่มีขนาดใหญ่ขึ้นทุกวัน
   - **Mitigation:** นอกจากบังคับทำ Composite Index `(equipment_id, start_date, end_date)` แล้ว ต้องบังคับใส่ Limit วันที่ค้นหาเสมอ (เช่น ระบบอนุญาตให้ค้นหาวันว่างล่วงหน้าได้ไม่เกิน 90 วัน) เพื่อปิดทางไม่ให้เกิด Full Table Scan
3. **Admin UX Overload:** 
   - แม้จะมีการออกแบบปุ่ม Quick Action (Return All / Maintenance All) แล้ว แต่การต้องมานั่งตรวจเช็คหุ่นทีละตัวในกรณีที่ยืมเยอะๆ อาจทำให้ Admin เกิดความล้า (Fatigue) และเกิด Human Error ได้ง่าย
4. **Google Apps Script (GAS) เป็น Single Point of Failure (SPOF):**
   - ระบบนี้พึ่งพา GAS ทั้งในการรัน Cron Job (เคลียร์คิว) และการวาด PDF
   - หาก Quota ของ Google หมด (เช่น เกิน 6 นาที/รันรอบ หรือส่งอีเมลเกินโควตารายวัน) หรือ API ของ Google ล่ม ระบบตรงนี้จะชะงักทันที

## 8. กฎการทำงานเชิงปฏิบัติการ (Operational Decision Rules)
เพื่อไม่ให้ Developer ต้อง "เดางาน" เองเวลาเขียนโค้ด ให้ยึดกฎเหล่านี้เป็นใบสั่งเด็ดขาด:
1. **Pending Locks Stock:** สถานะ `pending` จะหัก Stock ทันที แต่มีอายุขัย (Expiration)
2. **Pending Expiration:** คำร้องที่ `pending` จะหมดอายุใน **24 ชั่วโมง** หากไม่อนุมัติ (ใช้ `pg_cron` ของ Supabase วนลูปเช็คและเปลี่ยนสถานะเป็น `expired` โดยไม่ต้องพึ่ง GAS)
3. **Cancellation Rule & Cutoff:** 
   - Borrower: กดยกเลิกคำร้องของตัวเองได้ ตราบใดที่ **เวลาปัจจุบันห่างจาก `start_date` อย่างน้อย 1 วัน (24 ชั่วโมง)**
   - หากเหลือเวลา < 1 วันก่อนถึง `start_date`: ปุ่มยกเลิกฝั่ง Borrower จะถูก Lock (กดไม่ได้) ป้องกันการยกเลิกกะทันหันหลัง Admin เตรียมของแล้ว โดย UI จะแสดงข้อความ "กรุณาติดต่อเจ้าหน้าที่เพื่อยกเลิก"
   - Admin: ยกเลิกได้ทุกเมื่อ (Overrides all rules)
4. **Late Approval Rule:** ห้าม Admin กด Approve คำร้องที่ "เลยวันเริ่มต้นยืม (start_date) ไปแล้ว" ระบบต้องบังคับให้ Reject หรือ Admin ต้องแก้ Date Range ใหม่ให้ถูกต้องก่อนกดอนุมัติ
5. **Anti-Hoarding Rule (กันการกั๊กของ):**
   - **Limit Pending Requests:** User 1 คน สามารถมีคำร้องสถานะ `pending` ได้สูงสุดไม่เกิน **2 คำร้อง** ในเวลาเดียวกัน หากเกินต้องรอให้อนุมัติหรือถูกปฏิเสธก่อนถึงจะยืมใหม่ได้
   - **Limit Pending Items:** ในคำร้องที่ `pending` รวมกันทั้งหมด User ห้ามกดยืมของสะสมเกิด **5 ชิ้น** (Units) เพื่อป้องกันการกดลงตะกร้ากวาดดะ
6. **Purpose Enforcement:** การทำรายการยืม ต้องบังคับกรอก "รายวิชา/โครงการ" หรือ "เหตุผลการยืม" เสมอ ห้ามปล่อยว่าง เพื่อให้ Admin มีข้อมูลประกอบการตัดสินใจและป้องกันการยืมเล่น

## 9. การจัดลำดับความสำคัญสำหรับบริบท SIMSET (Phase 1 MVP vs Phase 2)

ด้วยขีดจำกัดทางเวลา โควตาผู้พัฒนา และความเสี่ยงด้านโครงสร้างที่สูงมาก **ขอแนะนำอย่างยิ่งให้ตัด Feature (Scope Down)** สำหรับ **Phase 1 (MVP - Minimum Viable Product)** เพื่อให้ระบบเปิดใช้งานได้จริงอย่างมั่นคง แล้วตั้งสิ่งที่มีความซับซ้อนไว้ใน Phase 2:

### 🎯 Phase 1: Core MVP (สิ่งจำเป็นพื้นฐาน - สร้างเสร็จไว ลดบั๊ก 80%)
*เป้าหมาย: รับคำร้องได้ สต๊อกไม่พันกัน Admin ทำงานผ่านระบบได้ และผู้บริหารเห็นภาพรวม*
- [x] **ลดทอนการคืน (No Partial Return):** ตัดระบบคืนบางส่วนออก Phase 1 บังคับให้เป็น **"คืนครบทั้งหมดรวดเดียว" (Return All)** ถ้ามีของพังให้ข้ามลอจิก DB ไปก่อน แล้วใช้การลงตาราง Comment ออฟไลน์แทน (ลดความซับซ้อน DB ลงมหาศาล)
- [x] **ลดทอน PDF (No GAS SPOF):** ตัดระบบ Generate PDF ยิงผ่าน GAS ออก. ใช้ปุ่ม "Print" ที่หน้า Web Browser โดยตรง (ใช้ CSS `@media print` จัดหน้าระดับ Pixel-perfect) และมีตัวเลือกให้ Admin กด **"Save as PDF" ผ่านระบบ Browser** ได้เลย (หลุดพ้นความเสี่ยง GAS 100%)
- [x] **ลดทอนตะกร้า (Single-Date Cart):** จองหลายชิ้นได้ **แต่บังคับใช้ ช่วงเวลา (Date Range) เดียวกันทั้งตะกร้า เริ่มต้นตั้งแต่ตอนเลือกวันหน้า Catalog** (ห้ามแยกวันยืมรายชิ้นเด็ดขาด) เพื่อให้เช็ค Carts Conflict ใน Query เดียวจบ
- [x] **อีเมลพื้นฐาน (Basic Tracking Link):** ส่งอีเมลแจ้งเตือน Approved/Rejected โดยยังไม่ต้องใช้ Server-side PDF แต่ในเนื้อหาอีเมลต้อง **แนบหมายเลขเอกสารอ้างอิง + URL เพื่อคลิกเข้ามาดูสถานะในหน้า Web Tracking** ให้แน่ชัด
- [x] **Executive KPIs (Dashboard):** เพิ่ม 4 ตัวชี้วัดหลัก (% Approved, % Cancelled, Avg Lead Time, Top Equipment) ไว้ที่หน้าแรกของ Admin ป้อนคำตอบให้ผู้บริหารได้ทันทีโดยไม่ต้องรอ Phase 2

### 🚀 Phase 2: Automation & Enterprise Scale (หลังระบบเริ่มนิ่งค่อยเพิ่ม)
- [ ] ระบบตรวจสอบสภาพรายชิ้น (Partial Return / Damage Tracking / Maintenance Status)
- [ ] ให้ Server วาด PDF อัตโนมัติ + แปะ QR Code ฝัง Hash ลงตาราง `document_artifacts` สำหรับการ Audit ย้อนหลัง
- [ ] Cart แบบ Advanced (ยืม 5 ชิ้น 5 ช่วงเวลาในบิลเดียว) แตก Conflict แยกตามชิ้น
- [ ] Dashboard สรุปสถิติและ Reports เชิงลึก

## 10. Phase X: Verification Checklist

### Security & Lint
- [ ] RLS (Row Level Security) ของ Supabase ทำงานถูกต้อง: **ห้าม Public Insert โดยเด็ดขาด**, แบ่ง Role คุมเข้ม:
  - **การกำหนด Role:** ใช้ตาราง **`user_roles`** เป็นความจริงสูงสุดเพียงตารางเดียว (Single source of truth) 
  - **สิทธิ์การแต่งตั้ง:** ผู้ที่จะมอบสิทธิ์ Admin ได้ต้องเป็นระดับ **Super Admin** และจัดการผ่าน SQL/Dashboard หลังบ้านเท่านั้น เพื่อความปลอดภัยสูงสุด
  - **Admin**: อ่านเขียนได้ทุกคำร้อง
  - **Borrower**: ผู้ยืมอ่านได้เฉพาะของตัวเอง (เช็ค `auth.uid()`) รวมไปถึงตารางลูกอย่าง `document_artifacts` ด้วย และแก้ไขผ่าน Safe RPC เท่านั้น
- [x] No SQL Injection: การค้นหา Tracking ID ต้องปลอดภัย
- [x] Document Anti-Spoofing: สร้าง Server-side PDF, เก็บ `pdf_hash` เข้าระบบ และตรวจสอบความแท้จริงผ่าน QR Code ได้เสมอ
- [x] Anti-Brute Force: ระบบค้นหา Tracking ID จำกัด Request per IP และ Cloudflare Turnstile **ตัองมี Verification ฝั่ง Server**
- [x] Secure API (RPC): ไม่ expose ให้ Insert table ตรงๆ ต้องผ่าน Supabase RPC function ที่มี Validation ฝั่ง Server
- [ ] ตัวแปรใน JavaScript ไม่ Error บัคซ่อนเร้น (Syntax / Undeclared Variables)

### Logical Checks
- [ ] **Date Conflict Testing:** ทดสอบจองหุ่นตัวเดียว (วันที่ 1-3) แล้วให้มือถืออีกเครื่องเปิดฟอร์มจอง (วันที่ 3-5) ต้องจองไม่ได้ (ถ้านับวันชนกัน) แต่ต้องจองวันที่ (4-5) ได้
- [ ] **Quantity Availability Testing:** ทดสอบหุ่นนับจำนวน (Total = 5) วันที่ (1-5) จองไปแล้ว 3 ชิ้น, วันที่ (3-7) จองอีก 2 ชิ้น. ดังนั้นวันที่ (3-5) ต้องเหลือ 0 ชิ้น แต่วันที่ (6-7) ต้องเหลือ 3 ชิ้น (เช็คตัวเลขตรงไปตรงมา)
- [ ] ทดสอบจองพร้อมกัน 2 เครื่องในเสี้ยววินาทีเดียวกัน (Race Condition)
- [ ] ตรวจสอบระบบล้างสต๊อกจองค้าง (Cron Job) ว่าปลดล็อคให้คนอื่นจองต่อได้จริง และเปลี่ยนเป็นสถานะ `expired` **เฉพาะกับที่กำลัง `pending`** อยู่นานเกินกำหนด
- [ ] **Damage Tracking Test:** นำหุ่น 1 ตัวตั้งเป็น `under_maintenance` เช็คว่า Availability หาย 1 ตัว และพอกลับมาเป็น `maintenance_completed` Stock ต้องคืนกลับมา. หากไปตั้งเป็น `damaged` Stock หายถาวร

### UX & UI Conformity
- [ ] **E-commerce Standard:** มีระบบ Cart ยืมหุ่น, มี Sticky Checkout, ฟีดแบ็กแอนิเมชันตอนกดเพิ่มลงตะกร้าชัดเจน สวยงาม พรีเมียม
- [ ] อิงตาม Web Design Guidelines, ห้ามใช้โทนสีม่วง/Violet (Purple Ban)
- [ ] โมบายต้องสามารถกดสั่งจองและกรอกฟอร์มได้สะดวก ทัชง่าย (Touch-friendly target size >= 44px)
- [ ] Socratic Gate was respected : ✅ ผ่าน (รับทราบข้อมูลทั้งหมดตามที่ถามแล้ว)

---
*Created by: `project-planner` Agent*
