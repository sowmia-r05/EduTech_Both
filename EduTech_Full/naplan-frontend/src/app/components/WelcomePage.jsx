import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/context/AuthContext";

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
import FreeVsPaidSection from '@/app/components/landing/FreeVsPaidSection'

export default function WelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isParent, isChild, isInitializing } = useAuth();

  // If URL has ?welcome=1, the user intentionally wants to see this page
  // so we skip the auto-redirect even if they're logged in
  const bypassRedirect = searchParams.get("welcome") === "1";

  useEffect(() => {
  if (bypassRedirect) return;
  if (isInitializing) return;
  // Only auto-redirect if genuinely on the root "/" — not if navigated here by mistake
  const currentHash = window.location.hash.replace("#", "") || "/";
  if (currentHash !== "/" && currentHash !== "") return;
  if (isParent) navigate("/parent-dashboard", { replace: true });
  else if (isChild) navigate("/child-dashboard", { replace: true });
}, [isParent, isChild, isInitializing, navigate, bypassRedirect]);

  return (
    <div>
      <Navbar />
      <HeroSection />
      <TrustBar />
      <HowItWorks />
      <WhySection />
      <FreeVsPaidSection />
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  )
}