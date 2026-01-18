'use client'

interface GenerationStepperProps {
  currentStep: number
  stepsCompleted: Record<string, boolean>
  onStepClick: (step: number) => void
}

const STEPS = [
  { number: 1, label: 'Главен герой' },
  { number: 2, label: 'Коректура' },
  { number: 3, label: 'Промпти за сцени' },
  { number: 4, label: 'Референции' },
  { number: 5, label: 'Сцени' },
]

export function GenerationStepper({
  currentStep,
  stepsCompleted,
  onStepClick,
}: GenerationStepperProps) {
  return (
    <div className="bg-white rounded-2xl shadow-warm p-6 border border-purple-100">
      <h2 className="text-lg font-bold text-purple-900 mb-4">Стъпки за генериране</h2>

      {/* Desktop Stepper */}
      <div className="hidden md:flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const isCompleted = stepsCompleted[`step${step.number}`]
          const isCurrent = currentStep === step.number
          const isClickable = isCompleted || step.number <= currentStep

          return (
            <div key={step.number} className="flex items-center flex-1">
              {/* Step Circle */}
              <button
                onClick={() => isClickable && onStepClick(step.number)}
                disabled={!isClickable}
                className={`flex flex-col items-center gap-2 transition-all ${
                  isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-purple-600 text-white ring-4 ring-purple-200'
                        : 'bg-neutral-200 text-neutral-600'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-xs font-bold text-center ${
                    isCurrent ? 'text-purple-900' : 'text-neutral-600'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector Line */}
              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    stepsCompleted[`step${step.number}`]
                      ? 'bg-green-500'
                      : 'bg-neutral-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile Stepper */}
      <div className="md:hidden space-y-3">
        {STEPS.map((step) => {
          const isCompleted = stepsCompleted[`step${step.number}`]
          const isCurrent = currentStep === step.number
          const isClickable = isCompleted || step.number <= currentStep

          return (
            <button
              key={step.number}
              onClick={() => isClickable && onStepClick(step.number)}
              disabled={!isClickable}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                isCurrent
                  ? 'border-purple-600 bg-purple-50'
                  : isCompleted
                    ? 'border-green-500 bg-green-50'
                    : 'border-neutral-200 bg-neutral-50'
              } ${isClickable ? 'cursor-pointer hover:shadow-md' : 'cursor-not-allowed opacity-50'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-purple-600 text-white'
                      : 'bg-neutral-300 text-neutral-600'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`font-bold ${isCurrent ? 'text-purple-900' : 'text-neutral-700'}`}
              >
                {step.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
