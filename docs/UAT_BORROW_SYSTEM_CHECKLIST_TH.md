# UAT Checklist: SIMSET Borrow

ใช้ checklist นี้ทดสอบกับ staff 2-3 คนด้วยข้อมูลจริงก่อนเปิดใช้เต็มรูปแบบ

## 1. Conflict / ยืมซ้ำช่วงวันเดียวกัน

- [ ] เลือกอุปกรณ์แบบ `tracked_unit` เช่น Flip chart จำนวน 1 ชิ้น ในช่วงวันที่ A-B แล้วส่งคำขอแรกสำเร็จ
- [ ] ส่งคำขอที่สองในช่วงวันที่ซ้อนกันและเกินจำนวนที่พร้อมใช้ ระบบต้องบล็อกหรือไม่เลือก unit เดิมซ้ำ
- [ ] ตรวจใน `borrow_request_items` ว่า `equipment_unit_id` หรือ `manikin_sap_id` ไม่ซ้ำในช่วงวันที่ active

SQL ตรวจซ้ำ:

```sql
select
  bri.equipment_unit_id,
  bri.manikin_sap_id,
  bri.start_date,
  bri.end_date,
  br.status,
  count(*) as active_count
from public.borrow_request_items bri
join public.borrow_requests br on br.id = bri.request_id
where br.status in ('pending', 'approved', 'ready', 'borrowed', 'overdue')
group by bri.equipment_unit_id, bri.manikin_sap_id, bri.start_date, bri.end_date, br.status
having count(*) > 1
order by active_count desc;
```

ผลที่คาดหวัง: ไม่มีแถวที่เป็น unit หรือหุ่นตัวเดียวกันซ้ำในช่วงวันที่ active

## 2. Reject

- [ ] สร้าง order ใหม่ให้เป็น `pending`
- [ ] หน้า `/approver` กด Reject โดยไม่กรอกเหตุผล ระบบต้องไม่ยอมให้ reject
- [ ] กรอกเหตุผลแล้ว Reject สำเร็จ
- [ ] หน้า tracking แสดงสถานะ `rejected`
- [ ] ตาราง `borrow_requests.reject_reason` มีเหตุผล
- [ ] ตาราง `borrow_request_status_audit` มีรายการเปลี่ยนสถานะ

SQL ตรวจ:

```sql
select tracking_id, status, reject_reason, rejected_at
from public.borrow_requests
where tracking_id = 'PUT_TRACKING_ID_HERE';
```

## 3. Overdue

- [ ] เตรียม order สถานะ `borrowed` ที่ `end_date` น้อยกว่า `current_date`
- [ ] รัน `select public.mark_overdue_borrow_requests();`
- [ ] order เปลี่ยนเป็น `overdue`
- [ ] มีรายการ `line_notification_outbox.event_type = 'overdue'`

SQL ตรวจ:

```sql
select br.tracking_id, br.status, max(bri.end_date) as due_date
from public.borrow_requests br
join public.borrow_request_items bri on bri.request_id = br.id
where br.tracking_id = 'PUT_TRACKING_ID_HERE'
group by br.tracking_id, br.status;
```

## 4. ใบยืม / Print PDF

- [ ] หลังส่งคำขอ หน้า success แสดงฟอร์มใบยืมพัสดุ
- [ ] มี Tracking ID
- [ ] มีชื่อผู้ยืม ตำแหน่ง หน่วยงาน เบอร์โทร
- [ ] มีวัตถุประสงค์ สถานที่ใช้งาน วันที่ยืม/คืน
- [ ] ตารางรายการมีชื่ออุปกรณ์ รหัสพัสดุ/รหัสหน่วย จำนวน
- [ ] กด Print แล้วบันทึกเป็น PDF ได้หนึ่งหน้า หรืออ่านได้ครบถ้วนถ้าเกินหนึ่งหน้า

## 5. Staff End-to-End

- [ ] Staff เห็น order ที่ approved ในคอลัมน์ “ต้องเตรียม”
- [ ] Staff แนบรูป pre-checkout และ Confirm Pickup ได้
- [ ] Order ย้ายไปคอลัมน์ “จ่ายออกไปแล้ว”
- [ ] Staff แนบรูป post-return และ Confirm Return ได้
- [ ] Order ย้ายไป “คืนแล้ววันนี้”
- [ ] หุ่นหรือ unit ที่ถูกยืมกลับเป็น `ready`

## เกณฑ์ผ่าน UAT

- ทุกข้อ critical ในหัวข้อ 1-5 ผ่าน
- ไม่มีข้อมูล unit/human-readable code สับสนกับ UUID ในหน้าผู้ใช้
- Staff 2-3 คนทำ flow ได้โดยไม่ต้องให้ developer ช่วย
- ปัญหาที่เหลือเป็นข้อความ/UX เล็กน้อย ไม่ใช่ logic ข้อมูลหรือสถานะ
