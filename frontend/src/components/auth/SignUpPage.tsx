import { SignUp } from '@clerk/react';

export default function SignUpPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <SignUp
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'bg-transparent shadow-none border border-gold-400/15 rounded-3xl',
            headerTitle: 'text-gold-100 font-display',
            headerSubtitle: 'text-gold-100/50',
            socialButtonsBlockButton: 'border border-gold-400/25 bg-ink-900/50 text-gold-100 hover:bg-ink-800/50',
            socialButtonsBlockButtonText: 'text-gold-100',
            formFieldInput: 'border border-gold-400/25 bg-ink-900/50 text-gold-100',
            formFieldLabel: 'text-gold-100/70',
            formButtonPrimary: 'bg-gold-sheen text-ink-900 hover:bg-gold-300',
            footerActionLink: 'text-gold-300 hover:text-gold-200',
          },
        }}
      />
    </div>
  );
}
