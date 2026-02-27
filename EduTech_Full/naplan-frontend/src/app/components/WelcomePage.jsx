import Navbar from '@/app/components/layout/Navbar'
import HeroSection from '@/app/components/landing/HeroSection'
import TrustBar from '@/app/components/landing/TrustBar'
import HowItWorks from '@/app/components/landing/HowItWorks'
import WhySection from '@/app/components/landing/WhySection'
import TestimonialsSection from '@/app/components/landing/TestimonialsSection'
import PricingSection from '@/app/components/landing/PricingSection'
import FAQSection from '@/app/components/landing/FAQSection'
import CTASection from '@/app/components/landing/CTASection'
import Footer from '@/app/components/landing/Footer'

export default function WelcomePage() {
  return (
    <div>
      <Navbar />
      <HeroSection />
      <TrustBar />
      <HowItWorks />
      <WhySection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  )
}
