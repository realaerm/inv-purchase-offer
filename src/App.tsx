import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BmsSessionProvider } from '@/contexts/BmsSessionContext'
import { OfferIdentityProvider } from '@/contexts/OfferIdentityContext'
import { SessionValidator } from '@/components/session/SessionValidator'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { AppLayout } from '@/components/layout/AppLayout'

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
        <Route path="/settings" element={<ModuleSettings />} />
        <Route path="/setup" element={<ConnectionSetup />} />
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
