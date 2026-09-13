import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BmsSessionProvider } from '@/contexts/BmsSessionContext'
import { OfferIdentityProvider } from '@/contexts/OfferIdentityContext'
import { SessionValidator } from '@/components/session/SessionValidator'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdminGate } from '@/components/admin/AdminGate'

// แต่ละหน้าโหลดแยก bundle — หน้าจัดทำใบเสนอซื้อใหญ่กว่าหน้าอื่นมาก
const ReorderPull = lazy(() => import('@/pages/ReorderPull'))
const OfferList = lazy(() => import('@/pages/OfferList'))
const OfferEditor = lazy(() => import('@/pages/OfferEditor'))
const OfferPrint = lazy(() => import('@/pages/OfferPrint'))
const ModuleSettings = lazy(() => import('@/pages/ModuleSettings'))
const ConnectionSetup = lazy(() => import('@/pages/ConnectionSetup'))

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" message="กำลังโหลดหน้า..." className="min-h-[50vh]" />}>
      <Routes>
        <Route path="/" element={<ReorderPull />} />
        <Route path="/offers" element={<OfferList />} />
        <Route path="/offers/new" element={<OfferEditor />} />
        <Route path="/offers/:id" element={<OfferEditor />} />
        <Route path="/offers/:id/print" element={<OfferPrint />} />
        {/* สองหน้านี้เปลี่ยนค่าที่กระทบทั้งโรงพยาบาล จึงอยู่หลังด่านผู้ดูแล
            (ฝั่ง server กันไว้อีกชั้นด้วย requireAdmin) */}
        <Route
          path="/settings"
          element={
            <AdminGate title="ตั้งค่าโมดูล">
              <ModuleSettings />
            </AdminGate>
          }
        />
        <Route
          path="/setup"
          element={
            <AdminGate title="การเชื่อมต่อ">
              <ConnectionSetup />
            </AdminGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <BmsSessionProvider>
        <SessionValidator>
          <OfferIdentityProvider>
            <AppLayout>
              <AppRoutes />
            </AppLayout>
          </OfferIdentityProvider>
        </SessionValidator>
      </BmsSessionProvider>
    </BrowserRouter>
  )
}
