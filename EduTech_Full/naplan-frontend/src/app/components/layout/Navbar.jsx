import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Link as ScrollLink } from 'react-scroll'

export default function Navbar() {
  const navigate = useNavigate()
  const [active, setActive] = useState('home')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const sections = ['home', 'why', 'faq']
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120 // offset for sticky navbar
      sections.forEach((id) => {
        const section = document.getElementById(id)
        if (section) {
          if (
            scrollPosition >= section.offsetTop &&
            scrollPosition < section.offsetTop + section.offsetHeight
          ) {
            setActive(id)
          }
        }
      })
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const links = [
    { id: 'home', label: 'Home' },
    { id: 'why', label: 'Why Choose Us' },
    { id: 'faq', label: 'FAQ' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">

        <div
          className="text-xl font-bold text-indigo-600 cursor-pointer"
          onClick={() => {
            const el = document.getElementById('home')
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
                  ? 'text-indigo-600'
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              {item.label}
            </ScrollLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-6">
          <button
            onClick={() => navigate('/login')}
            className="text-gray-600 hover:text-indigo-600 transition"
          >
            Login
          </button>

          <button
            onClick={() => navigate('/register')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-all duration-300 hover:-translate-y-1"
          >
            Enroll Now
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
            onClick={() => navigate('/register')}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg"
          >
            Enroll Now
          </button>
        </div>
      )}
    </header>
  )
}
