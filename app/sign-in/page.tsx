import { SignInForm } from '@/components/auth/sign-in-form'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative w-full max-w-md mx-auto">
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center gap-4 mb-6">
            <div className="w-16 h-16 bg-purple-600 rounded-3xl flex items-center justify-center shadow-warm-lg transform hover:scale-105 transition-transform duration-300">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-purple-900 mb-3 tracking-tight">
            Табло за поръчки
          </h1>
          <p className="text-neutral-600 text-lg">Влезте в своя акаунт за да продължите</p>
        </div>
        <div className="animate-slide-up bg-white p-8 rounded-2xl shadow-warm">
          <SignInForm />
          <p className="mt-6 text-center text-sm text-gray-600">
            Нямате акаунт?{' '}
            <Link href="/sign-up" className="text-purple-600 hover:text-purple-700 font-medium hover:underline">
              Регистрация
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
