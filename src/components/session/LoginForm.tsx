import { useState } from 'react'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

interface LoginFormProps {
  onConnect: (sessionId: string) => Promise<boolean>
  error?: Error | null
  isConnecting: boolean
}

export function LoginForm({ onConnect, error, isConnecting }: LoginFormProps) {
  const [sessionId, setSessionId] = useState(import.meta.env.BMS_SESSION_ID || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = sessionId.trim()
    if (!trimmed) return
    await onConnect(trimmed)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">แดชบอร์ด BMS</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ป้อนรหัสเซสชัน BMS เพื่อเชื่อมต่อกับฐานข้อมูลโรงพยาบาล
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="session-id" className="block text-sm font-medium text-foreground mb-1">
              รหัสเซสชัน
            </label>
            <input
              id="session-id"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="e.g., 02FA45D1-91EF-4D6E-B341-ED1436343807"
              disabled={isConnecting}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isConnecting || !sessionId.trim()}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isConnecting ? (
              <LoadingSpinner size="sm" message="กำลังเชื่อมต่อ..." />
            ) : (
              'เชื่อมต่อ'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          รหัสเซสชันได้รับจาก URL ของระบบ HOSxP หรือผู้ดูแลระบบ
        </p>
      </div>
    </div>
  )
}
