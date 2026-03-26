// =============================================================================
// Overview Page - Professional Hospital Dashboard Template
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import {
  Activity,
  Database,
  Layers,
  Sparkles,
  ArrowRight,
  Users,
  ClipboardList,
  TestTube,
  CalendarCheck,
  HeartPulse,
  Baby,
  GraduationCap,
  FileText,
  Syringe,
  Stethoscope,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Sample prompt configurations with icons
// ---------------------------------------------------------------------------

interface PromptCard {
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
  gradient: string;
}

const NAVBAR_MENU_TEXT = '\nเพิ่มเมนูเข้าถึง dashboard ใหม่นี้ให้แสดงที่ด้านบน Navbar ด้วย';

const PROMPT_CARDS: PromptCard[] = [
  {
    icon: Users,
    title: 'ประชากรในเขตรับผิดชอบ',
    description: 'ข้อมูลประชากรแยกรายหมู่บ้าน และปัญหาสุขภาพที่น่าสนใจ',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของประชากรในเขตรับผิดชอบ\nและสร้าง dashboard ใหม่เพิ่มอีก 1 หน้า แสดงข้อมูลของประชากร\nแยกรายหมู่บ้าน และข้อมูลสรุปปัญหาทางด้านสุขภาพที่น่าสนใจของแต่ละหมู่บ้าน${NAVBAR_MENU_TEXT}`,
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: HeartPulse,
    title: 'ระบบคัดกรองโรคเรื้อรัง',
    description: 'สถิติการคัดกรองเบาหวาน ความดัน โรคหลอดเลือดสมอง',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบคัดกรองโรคเรื้อรัง\nและสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการคัดกรองเบาหวาน\nความดัน โรคหลอดเลือดสมอง และความอ้วน พร้อมแผนภูมิแนวโน้ม${NAVBAR_MENU_TEXT}`,
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    icon: Baby,
    title: 'งานอนามัยแม่และเด็ก',
    description: 'ภาวะโภชนาการ พัฒนาการ และการฉีดวัคซีนเด็ก',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของงานอนามัยแม่และเด็ก\nและสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลภาวะโภชนาการ\nพัฒนาการเด็ก และการฉีดวัคซีนของเด็กในเขตรับผิดชอบ${NAVBAR_MENU_TEXT}`,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: TestTube,
    title: 'ระบบห้องปฏิบัติการ',
    description: 'สถิติการสั่งตรวจ ผลการตรวจ และการแจ้งเตือนค่าวิกฤติ',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบห้องปฏิบัติการ\nและสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการสั่งตรวจ\nผลการตรวจ และการแจ้งเตือนค่าวิกฤติ${NAVBAR_MENU_TEXT}`,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    icon: CalendarCheck,
    title: 'ระบบนัดหมายผู้ป่วย',
    description: 'สถิติการนัดหมาย มาตรวจตามนัด และการยกเลิกนัด',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบนัดหมายผู้ป่วย\nและสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการนัดหมาย\nการมาตรวจตามนัด และการยกเลิกหรือเลื่อนนัด${NAVBAR_MENU_TEXT}`,
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    icon: ClipboardList,
    title: 'ระบบผู้ป่วยใน',
    description: 'สถิติรับ-จำหน่าย คิวเตียง และระยะเวลารอรักษา',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบผู้ป่วยใน\nและสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติผู้ป่วยใน\nการรับ-จำหน่าย คิวเตียง และระยะเวลารอรับการรักษา${NAVBAR_MENU_TEXT}`,
    gradient: 'from-indigo-500 to-violet-600',
  },
  {
    icon: Stethoscope,
    title: 'บริการผู้ป่วยนอก',
    description: 'ปริมาณการให้บริการแยกตามแผนกและช่วงเวลา',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบบริการผู้ป่วยนอก\nและสร้าง dashboard ใหม่ 1 หน้า แสดงปริมาณการให้บริการ\nแยกตามแผนก ช่วงเวลา และประเภทการรักษา${NAVBAR_MENU_TEXT}`,
    gradient: 'from-fuchsia-500 to-pink-600',
  },
  {
    icon: Syringe,
    title: 'วัคซีนและโภชนาการเด็ก',
    description: 'อัตราการฉีดวัคซีน ความครอบคลุม และพฤติกรรมการบริโภค',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบวัคซีนและโภชนาการเด็ก\nและสร้าง dashboard ใหม่ 1 หน้า แสดงอัตราการฉีดวัคซีน\nความครอบคลุม และภาวะพฤติกรรมการบริโภคอาหารของเด็ก${NAVBAR_MENU_TEXT}`,
    gradient: 'from-sky-500 to-blue-600',
  },
  {
    icon: GraduationCap,
    title: 'งานบริการสุขภาพโรงเรียน',
    description: 'ผลการตรวจสุขภาพ วัคซีน และปัญหาสุขภาพนักเรียน',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบงานบริการสุขภาพโรงเรียน\nและสร้าง dashboard ใหม่ 1 หน้า แสดงผลการตรวจสุขภาพ\nการฉีดวัคซีน และปัญหาสุขภาพที่พบบ่อยของนักเรียน${NAVBAR_MENU_TEXT}`,
    gradient: 'from-teal-500 to-emerald-600',
  },
  {
    icon: FileText,
    title: 'ระบบเวชระเบียนผู้ป่วย',
    description: 'สถิติการยืม-คืนเวชระเบียน และติดตามตำแหน่งแฟ้ม',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบเวชระเบียนผู้ป่วย\nและสร้าง dashboard ใหม่ 1 หน้า แสดงสถิติการยืม-คืนเวชระเบียน\nและติดตามตำแหน่งของแฟ้มผู้ป่วย${NAVBAR_MENU_TEXT}`,
    gradient: 'from-slate-500 to-gray-600',
  },
  {
    icon: Users,
    title: 'ระบบวางแผนครอบครัว',
    description: 'หญิงวัยเจริญพันธุ์ วิธีคุมกำเนิด และผลตรวจมะเร็งเต้านม',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบวางแผนครอบครัว\nและสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลหญิงวัยเจริญพันธุ์\nการใช้วิธีคุมกำเนิด และผลการตรวจมะเร็งเต้านม${NAVBAR_MENU_TEXT}`,
    gradient: 'from-pink-500 to-rose-600',
  },
  {
    icon: Activity,
    title: 'ระบบฝากครรภ์และการคลอด',
    description: 'หญิงตั้งครรภ์ การฝากครรภ์ ผลการคลอด และตรวจหลังคลอด',
    prompt: `/bms-speckit-auto ค้นหาข้อมูลรายละเอียดการออกแบบระบบและคำสั่ง SQL\nจาก knowledge ของ HOSxP ในส่วนของระบบฝากครรภ์และการคลอด\nและสร้าง dashboard ใหม่ 1 หน้า แสดงข้อมูลหญิงตั้งครรภ์\nการฝากครรภ์ ผลการคลอด และการตรวจหลังคลอด${NAVBAR_MENU_TEXT}`,
    gradient: 'from-rose-600 to-red-600',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Overview() {
  const { session } = useBmsSessionContext();
  const userName = session?.userInfo.name || 'ผู้ใช้';

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
  };

  return (
    <div className="overview-container">
      {/* -----------------------------------------------------------------
          Hero Section
          ----------------------------------------------------------------- */}
      <section className="hero-section">
        <div className="hero-bg-pattern" />
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Dashboard</span>
          </div>
          <h1 className="hero-title">
            สวัสดี, <span className="text-gradient">{userName}</span>
          </h1>
          <p className="hero-subtitle">
            เริ่มต้นสร้าง Dashboard ด้วย AI ได้ทันที — เลือก Template ด้านล่าง
            หรือเขียน Prompt ของคุณเอง
          </p>
          <div className="hero-meta">
            <div className="hero-meta-item">
              <Database className="h-4 w-4" />
              <span>
                {session?.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Database
              </span>
            </div>
            <div className="hero-meta-divider" />
            <div className="hero-meta-item">
              <Layers className="h-4 w-4" />
              <span>{PROMPT_CARDS.length} Dashboard Templates</span>
            </div>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          Dashboard Templates Grid
          ----------------------------------------------------------------- */}
      <section className="templates-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Dashboard Templates</h2>
            <p className="section-description">
              คลิกเพื่อคัดลอก Prompt และวางในช่องแชทเพื่อสร้าง Dashboard อัตโนมัติ
            </p>
          </div>
        </div>

        <div className="templates-grid">
          {PROMPT_CARDS.map((card, index) => {
            const Icon = card.icon;
            return (
              <button
                key={index}
                onClick={() => copyPrompt(card.prompt)}
                className="template-card group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className={`template-icon-wrapper bg-gradient-to-br ${card.gradient}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="template-content">
                  <h3 className="template-title">{card.title}</h3>
                  <p className="template-description">{card.description}</p>
                </div>
                <div className="template-action">
                  <span className="template-action-text">คัดลอก Prompt</span>
                  <ArrowRight className="h-4 w-4 template-action-icon" />
                </div>
                <div className="template-hover-gradient" />
              </button>
            );
          })}
        </div>
      </section>

      {/* -----------------------------------------------------------------
          Quick Start Guide
          ----------------------------------------------------------------- */}
      <section className="guide-section">
        <div className="guide-card">
          <div className="guide-content">
            <h3 className="guide-title">วิธีใช้งาน</h3>
            <ol className="guide-steps">
              <li>
                <span className="guide-step-number">1</span>
                <span>เลือก Template ที่ต้องการจากด้านบน</span>
              </li>
              <li>
                <span className="guide-step-number">2</span>
                <span>คลิกเพื่อคัดลอก Prompt ไปยังคลิปบอร์ด</span>
              </li>
              <li>
                <span className="guide-step-number">3</span>
                <span>วางในช่องแชทและกดส่ง — AI จะสร้าง Dashboard ให้อัตโนมัติ</span>
              </li>
            </ol>
          </div>
          <div className="guide-visual">
            <div className="guide-visual-dot" />
            <div className="guide-visual-line" />
            <div className="guide-visual-dot" />
            <div className="guide-visual-line" />
            <div className="guide-visual-dot guide-visual-dot-active">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
