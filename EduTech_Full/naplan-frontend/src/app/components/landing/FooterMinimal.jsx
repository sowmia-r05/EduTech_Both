// src/app/components/landing/FooterMinimal.jsx

export default function FooterMinimal() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-5">
      <div className="max-w-4xl mx-auto text-center space-y-1.5">
        <p className="text-xs text-gray-400 leading-relaxed">
          *This is not an officially endorsed publication of the NAPLAN program
          and is produced by KAI Solutions independently of Australian
          governments.
        </p>
        <p className="text-xs text-gray-400">
          © KAI Solutions {currentYear}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
