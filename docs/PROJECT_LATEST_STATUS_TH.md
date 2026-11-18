# SIMSET Borrow System - สถานะและข้อสรุปล่าสุด

อัปเดตล่าสุด: 2026-06-22  
สถานะเอกสาร: ใช้เป็นสรุปล่าสุดสำหรับรายงานและวางงานถัดไป

## 1. ภาพรวมสถานะระบบ

ระบบปัจจุบันเป็น MVP สำหรับยืม-คืนหุ่นและอุปกรณ์ของ SIMSET โดยเปลี่ยนแนวทางผู้ยืมให้เรียบง่ายกว่าเดิม: ผู้ยืมทั่วไปไม่ต้อง login และไม่ต้องมี role ใน Supabase แต่กรอกข้อมูลตามใบยืม ได้แก่ ชื่อ, ตำแหน่ง, ภาควิชา/หน่วยงาน, เบอร์โทร, วัตถุประสงค์, สถานที่ใช้งาน, วันที่ยืม-คืน และรายการที่ต้องการยืม จากนั้นระบบออก `tracking_id` สำหรับติดตามสถานะ

ฝั่งเจ้าหน้าที่, ผู้อนุมัติ L1 และ admin ยังต้อง login ผ่าน Supabase Auth และใช้ role ใน `app_metadata` เพื่อควบคุมสิทธิ์

## 2. สิ่งที่ทำแล้วในระบบ

- รวม SQL หลักเป็น `supabase/current_mvp_release.sql` สำหรับใช้กับ Supabase โปรเจคใหม่
- ผู้ใช้ยืนยันแล้วว่า run SQL หลักใน Supabase ใหม่เรียบร้อย และตรวจพบคอลัมน์ผู้ยืมชุดใหม่ใน `borrow_requests`
- หน้า public checkout ใช้ RPC `submit_public_borrow_request_v2` โดยไม่บังคับ borrower login
- Worker allowlist เปิดให้เรียก RPC public borrower flow แล้ว
- มีหน้าหลักของระบบ: catalog, cart, checkout, track, approver, staff, report, admin
- มี workflow หลัก: `pending`, `approved`, `rejected`, `ready`, `borrowed`, `returned`, `cancelled`, `expired`, `overdue`
- มี role ฝั่งระบบ: `staff`, `approver_l1`, `admin`
- มี LINE outbox สำหรับ event สำคัญ: order ใหม่, L1 approved, overdue และ room dedicated review
- มี Staff Kanban, L1 approval, KPI report, condition snapshot, overdue job และ allocation rule ตามแผนระลอก 2-3
- มีการ sync สถานะ `manikins.status` จากสถานะคำขอยืมเมื่อจ่ายออก/รับคืน
- มี audit log สำหรับสถานะคำขอและการเปลี่ยน allocation type

## 3. ข้อสรุป Inventory ล่าสุด

ระบบควรรองรับของยืม 4 รูปแบบ ไม่บังคับให้ทุกอย่างเป็นหุ่นหรือเป็นครุภัณฑ์แบบเดียวกัน:

| รูปแบบ | ใช้กับ | วิธี track | หลักการคืน |
| --- | --- | --- | --- |
| `manikin` | หุ่นที่ต้องโยงกับหลายโปรเจค | ใช้ `manikins.sap_id` หรือรหัสหุ่นจริง | ต้องคืนหุ่นตัวที่ assign |
| `tracked_unit` | อุปกรณ์มีเลขครุภัณฑ์ หรือของไม่มีเลขแต่ติดรหัสภายในได้ เช่น Flip chart | ใช้รหัสครุภัณฑ์หรือรหัสแขวนภายใน | ต้องคืนจำนวนและตัวที่จ่ายออก |
| `kit` | กล่องอุปกรณ์ เช่น Airway box | track กล่องเป็นตัวหลัก และมี checklist ภายใน | ถ้ากล่องกลับมา ถือว่า order คืนได้; ของในกล่องที่ขาดให้เป็น refill task/note |
| `quantity_only` | ของที่นับจำนวนได้และไม่จำเป็นต้องแยกรายตัว | นับจำนวน | คืนตามจำนวน |

ข้อสรุปสำคัญ: หลักของระบบคือ “ยืมแล้วต้องคืนให้ครบ” แต่กรณี kit ให้ยึดกล่องเป็นของหลัก ส่วนของย่อยในกล่องไม่ควรทำให้ order ค้างคืน เพราะ staff จะตรวจละเอียดอีกครั้งตอนเตรียมงาน

สถานะ implementation ล่าสุด: `supabase/current_mvp_release.sql` เพิ่ม logic รองรับ inventory 4 รูปแบบแล้วผ่าน `equipments.inventory_mode`, `equipment_units`, `borrow_request_items.equipment_unit_id`, `kit_refill_tasks` และ RPC `staff_assign_inventory_unit_to_item`

## 4. ข้อสรุปการเลือกของและ approval

ผู้ยืมควรเลือกจาก catalog เป็น “ชนิด + จำนวน” ไม่ต้องเลือก serial/asset รายตัวเอง เพื่อลดภาระผู้ยืม

ระบบหลังบ้านหรือ staff dashboard ควรช่วยเลือกตัวจริงให้ โดยใช้ลำดับ:

1. ว่างในช่วงวันที่ขอยืม
2. ไม่ติด course reservation หรือ restriction
3. เลือกของที่ยืมได้ปกติก่อนของที่ต้องอนุมัติพิเศษ
4. ในกลุ่มเดียวกันให้แนะนำตัวที่ถูกยืมน้อยกว่า เพื่อ rotation/frequency
5. Staff override ได้ แต่ถ้าเลือกของที่ต้องอนุมัติพิเศษ ให้ทั้ง order เข้ากระบวนการ L1

ถ้าของปกติไม่พอ แต่มีของที่ต้องอนุมัติพิเศษ ระบบควรแจ้งผู้ยืมว่าบางรายการต้องพิจารณาก่อน และเจ้าหน้าที่อาจติดต่อกลับก่อนอนุมัติหรือปฏิเสธ

## 5. ประเภทหุ่นและข้อจำกัด

ใช้ `allocation_type` 3 ค่า:

- `rotating`: ยืมหมุนเวียนได้ตามปกติ
- `room_dedicated`: ประจำห้อง ต้องแจ้งล่วงหน้าและให้หัวหน้าพิจารณาพิเศษ
- `advance_course_dedicated`: หุ่น Advance ประจำคอร์ส ถ้าวันที่ขอยืมชนกับ course reservation ต้อง block

การเปลี่ยน `allocation_type` ต้องบันทึก audit log ว่าใครเปลี่ยน จากค่าใดเป็นค่าใด และเมื่อไร

## 6. ข้อสรุปเอกสารใบยืม

เอกสารใบยืมที่ระบบออกต้องยึดไฟล์แบบฟอร์มราชการเป็น template หลัก และหน้าตาต้องตรง 100% โดยเพิ่มได้เฉพาะ QR code หรือ `tracking_id` ที่มุมกระดาษ

แนวทางที่ควรใช้:

- ใช้ `.docx` template จริงเป็น source of truth
- เติมข้อมูลผู้ยืมและรายการยืมลงตำแหน่งเดิมของแบบฟอร์ม
- ไม่ควรวาด PDF ใหม่จาก HTML ถ้าต้องการหน้าตา 100% เพราะเสี่ยง layout เพี้ยน
- ลายเซ็นและช่องอนุมัติบนเอกสารยังควรปล่อยเป็นช่องว่างสำหรับกระดาษตาม workflow ปัจจุบัน
- QR code ควรชี้ไปที่หน้า tracking เช่น `/track.html?id=<tracking_id>` หรือ encode `tracking_id` โดยตรงถ้ายังไม่มี public URL production

ข้อที่ต้องตัดสินใจก่อนทำจริง: แบบฟอร์มจะบังคับเป็น 1 หน้าเสมอ หรืออนุญาตหน้าต่อรายการถ้ารายการยืมเกินจำนวนแถวใน template

## 7. สิ่งที่ยังควรทำต่อเพื่อให้ใช้งานจริง 100%

1. ตรวจและ seed ข้อมูลจริง: equipment catalog, manikins, tracked units, kits, courses และหน่วยงาน
2. รัน `supabase/current_mvp_release.sql` เวอร์ชันล่าสุดใน Supabase โปรเจคใหม่อีกครั้ง
3. ทำ document generation จาก `.docx` template และ render ตรวจ layout ก่อนส่งมอบ
4. ทดสอบ end-to-end บน Supabase โปรเจคใหม่: submit request, approve, prepare, borrowed, return, track, report
5. ตั้งค่า Cloudflare Worker secrets และ LINE Messaging API สำหรับ production
6. ทำ UAT กับเจ้าหน้าที่จริง โดยใช้ข้อมูลหุ่น/อุปกรณ์จริงอย่างน้อย 10-20 รายการ

## 9. CSV สำหรับข้อมูลจริงรอบถัดไป

`equipments.csv` ควรมีคอลัมน์:

```text
name_th,name_en,type,source_team_code,inventory_mode,total_quantity,maintenance_quantity,allocation_type,borrow_enabled
```

`equipment_units.csv` สำหรับ `tracked_unit` และ `kit` ควรมีคอลัมน์:

```text
equipment_name_or_id,unit_code,asset_code,status,requires_l1_approval,borrow_count,is_active,notes
```

`manikins.csv` ยังใช้สำหรับหุ่นแยก master:

```text
sap_id,team_code,status,is_active,needs_review
```

## 8. สถานะโดยประมาณสำหรับรายงานหัวหน้า

ถ้านับจากระบบ MVP ที่ส่งคำขอ ติดตาม อนุมัติ จ่ายคืน และรายงานได้ ระบบอยู่ประมาณ 70-80% ของการพร้อมทดลองใช้งาน

ส่วนที่ยังทำให้ยังไม่ควรเรียกว่า 100% คือข้อมูล inventory จริง, เอกสารใบยืมที่ต้องตรง template 100%, การตั้งค่า production secrets และ UAT กับเจ้าหน้าที่
