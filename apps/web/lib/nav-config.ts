export const NAV_CONFIG = {
  primary: [
    { label: "Configure", href: "/design" },
    { label: "Materials", href: "/materials" },
    { label: "My Orders", href: "/orders" },
  ],
  groups: [
    {
      label: "Operator",
      items: [
        { label: "Orders", href: "/operator/orders" },
        { label: "Materials", href: "/operator/materials" },
        { label: "Pricing", href: "/operator/pricing" },
        { label: "Partners", href: "/operator/partners" },
      ],
    },
  ],
  hero: {
    headline:
      "Design your custom cabinets online, get an instant quote, and have them built by a professional shop",
    cta: {
      label: "Start Designing",
      href: "/design",
    },
    image: "/images/cabinet-hero.jpg",
  },
};
