import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-white-smoke-nav w-full border-b border-grey-2">
      <div className="max-w-[1520px] mx-auto flex items-center justify-between py-5 px-10">
        {/* Logo */}
        <Link href="/" className="flex flex-col items-start min-w-[120px] mr-8">
          <img
            src="/images/logo.png"
            alt="The Dot Creative Agency"
            width={90}
            height={56}
            className="object-contain"
          />
          <span className="text-[0.81rem] text-grey-2 font-futura leading-none mt-[-8px] ml-[7px] tracking-tight">
            creative agency
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-12">
          <Link
            href="/services"
            className="font-futura text-[1.18rem] text-font-primary no-underline transition hover:text-yellow hover:underline underline-offset-4"
          >
            Services
          </Link>
          <Link
            href="/estimate"
            className="font-futura text-[1.18rem] text-font-primary no-underline transition hover:text-yellow hover:underline underline-offset-4 px-2 py-1 rounded-sm"
          >
            Project Estimate
          </Link>
          <Link
            href="/brief"
            className="font-futura text-[1.18rem] text-font-primary no-underline transition hover:text-yellow hover:underline underline-offset-4"
          >
            Brief
          </Link>
          <Link
            href="/contact"
            className="font-futura text-[1.18rem] text-font-primary no-underline transition hover:text-yellow hover:underline underline-offset-4"
          >
            Contacts
          </Link>
        </nav>

        {/* Phone & Location */}
        <div className="flex items-center min-w-[250px] justify-end ml-16">
          <a
            href="tel:+16474024420"
            className="font-futura text-[1.01rem] text-font-primary underline bg-yellow px-2 py-1 rounded font-normal transition-all hover:bg-yellow hover:no-underline hover:text-yellow"
            style={{
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
              fontWeight: 400,
              letterSpacing: "0.01em",
              lineHeight: "1.45",
            }}
          >
            +1 (647) 402-4420
          </a>
          <span className="font-futura text-[1.01rem] text-font-primary ml-4">
            ONTARIO, CANADA
          </span>
        </div>
      </div>
    </header>
  );
}
