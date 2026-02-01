'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GenerationStepper } from './generation-stepper'
import { GenerationCostTracker } from './generation-cost-tracker'
import { Step1CharacterImage } from './step1/step1-character-image'
import { Step2Proofread } from './step2/step2-proofread'
import { Step3ScenePrompts } from './step3/step3-scene-prompts'
import { Step4CharacterRefs } from './step4/step4-character-refs'
import { Step5SceneImages } from './step5/step5-scene-images'
import { Tables } from '@/lib/database.types'

// Extended types for the component
type BookGeneration = Tables<'book_generations'>
type BookConfiguration = Tables<'book_configurations'>

interface StepsCompleted {
  step1: boolean
  step2: boolean
  step3: boolean
  step4: boolean
  step5: boolean
  [key: string]: boolean  // Index signature for Record<string, boolean> compatibility
}

interface GenerationWorkflowProps {
  generation: BookGeneration
  bookConfig: BookConfiguration
  orderId: string
}

export function GenerationWorkflow({
  generation,
  bookConfig,
  orderId,
}: GenerationWorkflowProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(generation.current_step || 1)

  const defaultSteps: StepsCompleted = {
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
  }

  const [stepsCompleted, setStepsCompleted] = useState<StepsCompleted>(
    generation.steps_completed
      ? (generation.steps_completed as unknown as StepsCompleted)
      : defaultSteps
  )

  const handleStepComplete = async (stepNumber: number) => {
    // Mark step as completed
    const updatedSteps = {
      ...stepsCompleted,
      [`step${stepNumber}`]: true,
    }
    setStepsCompleted(updatedSteps)

    // Move to next step if not already there
    if (currentStep === stepNumber && stepNumber < 5) {
      setCurrentStep(stepNumber + 1)
    }

    // Update backend
    try {
      await fetch(`/api/generation/${generation.id}/update-step`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: stepNumber < 5 ? stepNumber + 1 : stepNumber,
          stepsCompleted: updatedSteps,
        }),
      })
    } catch (error) {
      console.error('Failed to update step:', error)
    }

    // Refresh the page data
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Stepper and Cost Tracker */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="flex-1">
          <GenerationStepper
            currentStep={currentStep}
            stepsCompleted={stepsCompleted}
            onStepClick={setCurrentStep}
          />
        </div>
        <GenerationCostTracker generationId={generation.id} />
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl shadow-warm p-6 border border-purple-100">
        {currentStep === 1 && (
          <Step1CharacterImage
            generationId={generation.id}
            bookConfig={bookConfig}
            onComplete={() => handleStepComplete(1)}
          />
        )}
        {currentStep === 2 && (
          <Step2Proofread
            generationId={generation.id}
            bookConfig={bookConfig}
            onComplete={() => handleStepComplete(2)}
          />
        )}
        {currentStep === 3 && (
          <Step3ScenePrompts
            generationId={generation.id}
            onComplete={() => handleStepComplete(3)}
          />
        )}
        {currentStep === 4 && (
          <Step4CharacterRefs
            generationId={generation.id}
            bookConfig={bookConfig}
            onComplete={() => handleStepComplete(4)}
          />
        )}
        {currentStep === 5 && (
          <Step5SceneImages
            generationId={generation.id}
            onComplete={() => handleStepComplete(5)}
          />
        )}
      </div>
    </div>
  )
}
