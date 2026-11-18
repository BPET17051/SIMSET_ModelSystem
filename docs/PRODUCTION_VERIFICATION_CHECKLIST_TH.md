# Production Verification Checklist

เอกสารนี้ใช้สำหรับตรวจหลัง deploy production ของระบบ SiMSET Borrowing/Tracking/Admin

วันที่ตรวจ: `________________`
ผู้ตรวจ: `________________`
โดเมนที่ตรวจ: `https://simset-showroom.pages.dev`
deployment URL: `________________`

เกณฑ์การตัดสิน:
- `Pass` ใช้งานได้ตรงตามที่คาด
- `Fail` ใช้งานไม่ได้หรือพฤติกรรมผิด
- `N/A` ไม่อยู่ในขอบเขตของรอบนี้

## 1. Pre-check

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| หน้าแรกเปิดได้ | เปิด `/` ต้องได้ HTTP 200 และหน้าโหลดปกติ | `___` |
| หน้ายืมเปิดได้ | เปิด `/borrow` ต้องได้ HTTP 200 | `___` |
| หน้าประวัติเปิดได้ | เปิด `/history` ต้องได้ HTTP 200 | `___` |
| หน้าติดตามเปิดได้ | เปิด `/tracking` ต้องได้ HTTP 200 | `___` |
| หน้าแอดมินเปิดได้ | เปิด `/admin/` ต้องได้ HTTP 200 | `___` |
| ไม่พบ Mojibake | ตรวจข้อความไทยบนหน้า `borrow`, `history`, `tracking`, `success` | `___` |
| ไม่พบ error หนักใน console ตอนโหลดหน้า | เปิด DevTools ดู console บนหน้า `borrow` และ `tracking` | `___` |

## 2. OAuth Login / Logout

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| ปุ่มเข้าสู่ระบบพาไป Google ได้ | ที่หน้า `/borrow` กด login ต้องไม่เด้ง JSON หรือ 404 | `___` |
| login ด้วยบัญชีทดสอบได้ | ใช้ test user ที่อยู่ใน Google OAuth test users | `___` |
| redirect กลับหน้าเดิมได้ | หลัง login จาก `/borrow` ต้องกลับมาที่ `/borrow` | `___` |
| สถานะผู้ใช้แสดงถูกต้อง | หลัง login ต้องแสดง email หรือ state logged-in บนหน้า borrower | `___` |
| logout ได้ | กด logout แล้ว state ต้องกลับเป็น logged-out | `___` |
| session คงอยู่หลัง refresh | login แล้ว refresh หน้า `borrow` หรือ `history` ต้องยังอยู่ในระบบ | `___` |

## 3. Borrower Flow

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| เลือกวันยืม-คืนได้ | ตั้ง start/end date บน `/borrow` | `___` |
| filter/search ใช้งานได้ | ค้นหาอุปกรณ์หรือกด age filter แล้วรายการเปลี่ยน | `___` |
| เพิ่มอุปกรณ์ลงตะกร้าได้ | เพิ่มอย่างน้อย 1 รายการ | `___` |
| สรุปคำขอแสดงถูกต้อง | ตรวจ purpose, ช่วงวัน, จำนวนรายการก่อน submit | `___` |
| submit คำขอได้ | ส่งคำขอสำเร็จโดยไม่ error | `___` |
| ไปหน้า success ได้ | หลัง submit ต้องไป `/success?tid=...` หรือ route เทียบเท่า | `___` |
| success page แสดง Tracking ID ถูกต้อง | ค่าใน URL ต้องตรงกับค่าที่แสดงบนหน้า | `___` |
| success page แสดงรายการและสถานะได้ | ตรวจ purpose, created_at, items, status | `___` |
| ปุ่มพิมพ์ทำงาน | กด print แล้ว browser print dialog เปิด | `___` |
| ปุ่มไปหน้าติดตามทำงาน | จาก success ไปหน้า tracking ของคำขอเดิมได้ | `___` |

## 4. Tracking / Cancel Flow

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| เปิดคำขอด้วย Tracking ID ได้ | กรอก Tracking ID ที่เพิ่งสร้างใน `/tracking` | `___` |
| แสดงสถานะและรายละเอียดถูกต้อง | ดูสถานะ, รายการ, วันที่, purpose | `___` |
| cancel ได้เฉพาะคำขอที่ยัง pending | คำขอ pending ต้องมีปุ่มยกเลิก | `___` |
| ยกเลิกคำขอสำเร็จ | กดยกเลิกแล้วสถานะเปลี่ยนเป็น cancelled | `___` |
| คำขอที่ approved ห้ามยกเลิก | ถ้าเป็น approved ต้องไม่มีปุ่มยกเลิกหรือกดไม่ได้ | `___` |
| ไม่พบ native alert/confirm แปลก ๆ | flow ยกเลิกต้องใช้ in-page modal ตามที่ออกแบบ | `___` |

## 5. Borrower History

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| หน้า `/history` เปิดได้หลัง login | เปิดแล้วไม่เด้งออก ไม่ error | `___` |
| แสดงประวัติของบัญชีที่ล็อกอินเท่านั้น | ตรวจว่ารายการเป็นของ user ปัจจุบัน | `___` |
| KPI summary แสดงได้ | total / pending / approved แสดงค่า | `___` |
| เปิดคำขอจาก history ไป tracking ได้ | กดรายการใดรายการหนึ่งแล้วไปหน้าติดตามได้ | `___` |
| mobile layout อ่านได้ | เปิดบนมือถือหรือ responsive mode แล้วไม่ล้นจอ | `___` |

## 6. Admin Flow

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| หน้า login แอดมินเปิดได้ | เปิด `/admin/` แล้วหน้าโหลดครบ | `___` |
| login แอดมินได้ | ใช้บัญชีแอดมินทดสอบ | `___` |
| dashboard โหลด tab หลักได้ | ดู queue, inventory, reports, teams ได้ | `___` |
| queue แสดงรายการคำขอได้ | อย่างน้อย 1 รายการต้องโหลดขึ้น | `___` |
| approve request ทำงาน | approve แล้วสถานะคำขอเปลี่ยนถูกต้อง | `___` |
| reject request ทำงาน | reject พร้อมเหตุผลแล้วสถานะเปลี่ยนถูกต้อง | `___` |
| return inspection modal เปิดได้ | จากรายการคืนของ เปิด modal ได้ | `___` |
| return inspection บันทึกได้ | กรอกปกติ/ชำรุด/ส่งซ่อม แล้วบันทึกสำเร็จ | `___` |
| ไม่มี CSP error จาก inline onclick | เปิด DevTools ที่ admin queue แล้วไม่เจอ error นี้ | `___` |
| mobile/tablet queue ใช้งานได้ | responsive mode บนจอเล็กยังอ่านและกดปุ่มได้ | `___` |

## 7. Security / Platform Checks

| รายการ | วิธีตรวจ | ผล |
|---|---|---|
| OAuth authorize ไม่วิ่งผ่าน worker proxy | ดู Network ตอน login ต้องไป Supabase/Google ตามปกติ | `___` |
| worker CORS ใช้งานได้กับ API ที่ยังใช้ proxy | ตรวจหน้า admin หรือ flow ที่ยังใช้ worker | `___` |
| ไม่พบ 403/404 สำคัญจาก worker ระหว่างใช้งานปกติ | ดู Network/Console ระหว่าง submit, queue, tracking | `___` |
| ไม่มี response header ผิด charset | HTML หลักควรเป็น `text/html; charset=utf-8` | `___` |

## 8. Smoke Summary

| รายการ | ผล |
|---|---|
| Public catalog | `___` |
| Borrow | `___` |
| Success page | `___` |
| Tracking | `___` |
| Borrower history mobile | `___` |
| Tracking tablet | `___` |
| Admin login | `___` |
| Admin queue mobile | `___` |
| Admin queue phone | `___` |

คำสั่งอ้างอิง:

```powershell
$env:SMOKE_BASE_URL='https://simset-showroom.pages.dev/'
node scripts\browser_smoke_test.js
```

## 9. Final Sign-off

| หัวข้อ | สถานะ |
|---|---|
| พร้อมใช้งานสำหรับผู้ยืม | `___` |
| พร้อมใช้งานสำหรับเจ้าหน้าที่ | `___` |
| พร้อมใช้งาน OAuth จริง | `___` |
| พร้อมใช้งานบนมือถือ/แท็บเล็ตใน flow หลัก | `___` |
| อนุมัติให้คง production release นี้ | `___` |

หมายเหตุ / ปัญหาที่พบ:

```text
____________________________________________________________
____________________________________________________________
____________________________________________________________
```
