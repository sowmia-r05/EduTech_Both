import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, Users, GraduationCap } from "lucide-react";
import { Link as ScrollLink } from "react-scroll";

export default function Navbar() {
  const navigate = useNavigate();
  const [active, setActive] = useState("home");
  const [open, setOpen] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // Highlight active section
  useEffect(() => {
    const sections = ["home", "why", "pricing", "faq"];

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;

      sections.forEach((id) => {
        const section = document.getElementById(id);
        if (section) {
          if (
            scrollPosition >= section.offsetTop &&
            scrollPosition < section.offsetTop + section.offsetHeight
          ) {
            setActive(id);
          }
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dialog on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setShowLoginDialog(false);
    };
    if (showLoginDialog) {
      window.addEventListener("keydown", handleEsc);
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showLoginDialog]);

  const links = [
    { id: "home", label: "Home" },
    { id: "why", label: "Why Choose Us" },
    { id: "pricing", label: "Pricing"},
    { id: "faq", label: "FAQ" },
  ];

  const handleLoginClick = () => {
    setOpen(false);
    setShowLoginDialog(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div
            className="text-xl font-bold text-indigo-600 cursor-pointer"
            onClick={() => {
              const el = document.getElementById("home");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            NAPLAN Prep
          </div>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-10 font-medium">
            {links.map((item) => (
              <ScrollLink
                key={item.id}
                to={item.id}
                smooth={true}
                offset={-100}
                duration={500}
                className={`cursor-pointer transition ${
                  active === item.id
                    ? "text-indigo-600"
                    : "text-gray-600 hover:text-indigo-600"
                }`}
              >
                {item.label}
              </ScrollLink>
            ))}
          </nav>

          {/* Desktop Buttons */}
          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={handleLoginClick}
              className="text-gray-600 hover:text-indigo-600 transition"
            >
              Login
            </button>

            <button
              onClick={() => navigate("/parent/create")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-all duration-300 hover:-translate-y-1"
            >
             Create Account
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {open && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-6 space-y-6">
            {links.map((item) => (
              <ScrollLink
                key={item.id}
                to={item.id}
                smooth={true}
                offset={-100}
                duration={500}
                onClick={() => setOpen(false)}
                className="block cursor-pointer"
              >
                {item.label}
              </ScrollLink>
            ))}

            <button
              onClick={handleLoginClick}
              className="block text-gray-600"
            >
              Login
            </button>

            <button
              onClick={() => {
                setOpen(false);
                navigate("/free-trial");
              }}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg"
            >
              Start Free Trial
            </button>
          </div>
        )}
      </header>

      {/* ── Login Dialog ──────────────────────────── */}
      {showLoginDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLoginDialog(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-[0_25px_70px_rgba(0,0,0,0.15)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                Login As
              </h2>
              <button
                onClick={() => setShowLoginDialog(false)}
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Options */}
            <div className="p-6 space-y-3">
              {/* Parent Login */}
              <button
                onClick={() => {
                  setShowLoginDialog(false);
                  navigate("/parent-login");
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200 group"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Parent Login</p>
                  <p className="text-sm text-gray-500">
                    Manage children &amp; view results
                  </p>
                </div>
              </button>

              {/* Child Login */}
              <button
                onClick={() => {
                  setShowLoginDialog(false);
                  navigate("/child-login");
                }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 transition-all duration-200 group"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition">
                  <GraduationCap className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Child Login</p>
                  <p className="text-sm text-gray-500">
                    Take quizzes &amp; view feedback
                  </p>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
              <p className="text-center text-xs text-gray-400">
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => {
                    setShowLoginDialog(false);
                    navigate("/parent/create");
                  }}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  Create one
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}