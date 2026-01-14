import { Appearance } from "@clerk/types";

export const clerkAppearance: Appearance = {
  layout: {
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "bottom",
    showOptionalFields: true,
    termsPageUrl: undefined,
    privacyPageUrl: undefined,
    helpPageUrl: undefined,
  },
  variables: {
    colorPrimary: "#2563eb", // Blue 600
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#1f2937", // Gray 800
    colorText: "#1f2937", // Gray 800
    colorTextSecondary: "#6b7280", // Gray 500
    colorDanger: "#dc2626", // Red 600
    colorSuccess: "#16a34a", // Green 600
    colorWarning: "#ea580c", // Orange 600
    borderRadius: "0.5rem", // rounded-lg
    fontFamily: "var(--font-geist-sans)",
    fontSize: "1rem",
  },
  elements: {
    card: "shadow-lg",
    headerTitle: "text-2xl font-bold",
    headerSubtitle: "text-gray-600",
    socialButtonsBlockButton: "border border-gray-300 hover:bg-gray-50",
    formButtonPrimary:
      "bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors",
    formFieldInput:
      "border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    formFieldLabel: "text-sm font-medium text-gray-700",
    footerActionLink: "text-blue-600 hover:text-blue-700 font-medium",
    identityPreviewText: "text-sm font-medium",
    identityPreviewEditButton: "text-blue-600 hover:text-blue-700",
    formHeaderTitle: "text-xl font-semibold",
    formHeaderSubtitle: "text-gray-600 text-sm",
    dividerLine: "bg-gray-200",
    dividerText: "text-gray-500 text-sm",
    formFieldInputShowPasswordButton: "text-gray-500 hover:text-gray-700",
    formFieldError: "text-red-600 text-sm",
    alertText: "text-sm",
    formResendCodeLink: "text-blue-600 hover:text-blue-700 text-sm",
    otpCodeFieldInput:
      "border border-gray-300 rounded-lg text-center font-mono text-lg focus:ring-2 focus:ring-blue-500",
    // Hide the entire footer including "Secured by Clerk" branding
    footer: {
      display: "none",
    },
    // Hide UserButton popover footer
    userButtonPopoverFooter: {
      display: "none",
    },
    // Style UserButton components
    userButtonAvatarBox: "border-2 border-gray-200",
    userButtonPopoverCard: "shadow-lg",
    userButtonPopoverActionButton: "hover:bg-gray-100",
    userButtonPopoverActionButtonText: "text-gray-700",
    userButtonPopoverActionButtonIcon: "text-gray-500",
    // Style UserProfile/Settings modal components
    modalBackdrop: "bg-black/50",
    modalContent: "shadow-2xl",
    modalCloseButton: "text-gray-500 hover:text-gray-700",
    profileSectionPrimaryButton:
      "bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors",
    profileSectionContent: "text-gray-700",
    profileSectionTitle: "text-xl font-semibold text-gray-900",
    profileSectionTitleText: "text-xl font-semibold text-gray-900",
    navbar: "border-b border-gray-200",
    navbarButton: "text-gray-700 hover:text-blue-600",
    navbarButtonIcon: "text-gray-500",
    accordionTriggerButton: "hover:bg-gray-50",
    // Additional button styling
    button: "font-medium transition-colors",
    buttonArrowIcon: "text-gray-500",
    // Additional elements to style
    menuList: "border border-gray-200 shadow-lg",
    menuItem: "hover:bg-gray-100",
    badge: "bg-blue-100 text-blue-700",
    backLink: "text-blue-600 hover:text-blue-700",
  },
};
