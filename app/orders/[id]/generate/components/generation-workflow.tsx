'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GenerationStepper } from './generation-stepper'
import { Step1CharacterImage } from './step1/step1-character-image'
import { Step2Proofread } from './step2/step2-proofread'
import { Step3CharacterList } from './step3/step3-character-list'
import { Step4ScenePrompts } from './step4/step4-scene-prompts'
import { Step5CharacterRefs } from './step5/step5-character-refs'
import { Step6SceneImages } from './step6/step6-scene-images'

interface GenerationWorkflowProps {
  generation: any
  bookConfig: any
  orderId: string
}

export function GenerationWorkflow({
  generation,
  bookConfig,
  orderId,
}: GenerationWorkflowProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(generation.current_step || 1)
  const [stepsCompleted, setStepsCompleted] = useState(
    generation.steps_completed || {
      step1: false,
      step2: false,
      step3: false,
      step4: false,
      step5: false,
      step6: false,
    }
  )

  const handleStepComplete = async (stepNumber: number) => {
    // Mark step as completed
    const updatedSteps = {
      ...stepsCompleted,
      [`step${stepNumber}`]: true,
    }
    setStepsCompleted(updatedSteps)

    // Move to next step if not already there
    if (currentStep === stepNumber && stepNumber < 6) {
      setCurrentStep(stepNumber + 1)
    }

    // Update backend
    try {
      await fetch(`/api/generation/${generation.id}/update-step`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentStep: stepNumber < 6 ? stepNumber + 1 : stepNumber,
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
      {/* Stepper */}
      <GenerationStepper
        currentStep={currentStep}
        stepsCompleted={stepsCompleted}
        onStepClick={setCurrentStep}
      />

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
          <Step3CharacterList
            generationId={generation.id}
            onComplete={() => handleStepComplete(3)}
          />
        )}
        {currentStep === 4 && (
          <Step4ScenePrompts
            generationId={generation.id}
            onComplete={() => handleStepComplete(4)}
          />
        )}
        {currentStep === 5 && (
          <Step5CharacterRefs
            generationId={generation.id}
            onComplete={() => handleStepComplete(5)}
          />
        )}
        {currentStep === 6 && (
          <Step6SceneImages
            generationId={generation.id}
            onComplete={() => handleStepComplete(6)}
          />
        )}
      </div>
    </div>
  )
}
