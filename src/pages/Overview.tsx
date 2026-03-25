// =============================================================================
// Overview Page - Blank template for main page
// =============================================================================

export default function Overview() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold text-slate-700 mb-2">หน้าหลัก</h2>
        <p className="text-slate-500">template project - เริ่มต้นพัฒนาจากที่นี่</p>
      </div>

      {/* Sample Prompts Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800">ตัวอย่าง Prompt สำหรับสร้าง Dashboard</h3>
        </div>

        <div className="space-y-3">
          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของประชากรในเขตรับผิดชอบ
และสร้าง dashboard ใหม่เพิ่มอีก 1 หน้า แสดงข้อมูลของประชากร
แยกรายหมู่บ้าน และข้อมูลสรุปปัญหาทางด้านสุขภาพที่น่าสนใจของแต่ละหมู่บ้าน`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบคัดกรองโรคเรื้อรัง
และสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการคัดกรองเบาหวาน
ความดัน โรคหลอดเลือดสมอง และความอ้วน พร้อมแผนภูมิแนวโน้ม`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของงานอนามัยแม่และเด็ก
และสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลภาวะโภชนาการ
พัฒนาการเด็ก และการฉีดวัคซีนของเด็กในเขตรับผิดชอบ`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบห้องปฏิบัติการ
และสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการสั่งตรวจ
ผลการตรวจ และการแจ้งเตือนค่าวิกฤติ`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบนัดหมายผู้ป่วย
และสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการนัดหมาย
การมาตรวจตามนัด และการยกเลิกหรือเลื่อนนัด`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบผู้ป่วยใน
และสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติผู้ป่วยใน
การรับ-จำหน่าย คิวเตียง และระยะเวลารอรับการรักษา`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบบริการผู้ป่วยนอก
และสร้าง dashboard ใหม่ 1 หน้า แสดงปริมาณการให้บริการ
แยกตามแผนก ช่วงเวลา และประเภทการรักษา`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบวัคซีนและโภชนาการเด็ก
และสร้าง dashboard ใหม่ 1 หน้า แสดงอัตราการฉีดวัคซีน
ความครอบคลุม และภาวะพฤติกรรมการบริโภคอาหารของเด็ก`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบงานบริการสุขภาพโรงเรียน
และสร้าง dashboard ใหม่ 1 หน้า แสดงผลการตรวจสุขภาพ
การฉีดวัคซีน และปัญหาสุขภาพที่พบบ่อยของนักเรียน`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบเวชระเบียนผู้ป่วย
และสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการยืม-คืนเวชระเบียน
และติดตามตำแหน่งของแฟ้มผู้ป่วย`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบวางแผนครอบครัว
และสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลหญิงวัยเจริญพันธุ์
การใช้วิธีคุมกำเนิด และผลการตรวจมะเร็งเต้านม`}
            </code>
          </div>

          <div className="bg-white/80 rounded-lg p-4 border border-blue-100">
            <code className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
{`/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL
จาก knowledge ของ HOSxP ในส่วนของระบบฝากครรภ์และการคลอด
และสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลหญิงตั้งครรภ์
การฝากครรภ์ ผลการคลอด และการตรวจหลังคลอด`}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
