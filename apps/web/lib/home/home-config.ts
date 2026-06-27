/**
 * home-config — the company's root surface (company-root-landing-001 +
 * homepage-composition-001). Written by provisioning (_step_substrate_install)
 * from the homepage composer / CTO home_mode + CMO positioning. Do NOT hand-edit.
 */
export interface HomeCta {
  label: string;
  href: string;
}

export interface HomeFeature {
  title: string;
  body: string;
}

export interface SectionImage {
  url?: string;
  alt?: string;
  caption?: string;
}

export interface HeroSection {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  image?: SectionImage;
}
export interface StatsSection {
  type: "stats";
  title?: string;
  stats: { value: string; label: string }[];
}
export interface HowItWorksSection {
  type: "how_it_works";
  title?: string;
  subhead?: string;
  steps: { title: string; body: string }[];
}
export interface FeatureGridSection {
  type: "feature_grid";
  title?: string;
  subhead?: string;
  features: HomeFeature[];
}
export interface FeatureSpotlightSection {
  type: "feature_spotlight";
  title?: string;
  items: { title: string; body: string; image?: SectionImage }[];
}
export interface SocialProofSection {
  type: "social_proof";
  title?: string;
  quotes: { quote: string; author?: string; role?: string }[];
}
export interface FaqSection {
  type: "faq";
  title?: string;
  items: { q: string; a: string }[];
}
export interface PricingTeaserSection {
  type: "pricing_teaser";
  title?: string;
  subhead?: string;
  tiers: {
    name: string;
    price?: string;
    period?: string;
    features: string[];
    cta?: HomeCta;
    highlighted?: boolean;
  }[];
}
export interface GallerySection {
  type: "gallery";
  title?: string;
  images: SectionImage[];
}
export interface CtaBandSection {
  type: "cta_band";
  headline: string;
  subhead?: string;
  cta?: HomeCta;
}

export type HomeSection =
  | HeroSection
  | StatsSection
  | HowItWorksSection
  | FeatureGridSection
  | FeatureSpotlightSection
  | SocialProofSection
  | FaqSection
  | PricingTeaserSection
  | GallerySection
  | CtaBandSection;

export interface HomeConfig {
  mode: "landing" | "conversation";
  sections?: HomeSection[];
  headline?: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  featuresTitle?: string;
  features?: HomeFeature[];
  closingHeadline?: string;
}

export const homeConfig: HomeConfig = {
  "mode": "landing",
  "headline": "Design Your Exact Kitchen Cabinets Online \u2014 Get a Real Quote in Minutes, Not Weeks",
  "subhead": "An online platform that lets US homeowners design fully custom cabinets in a browser-embedded Mozaik 3D configurator \u2014 the same software professional cabinet shops use \u2014 and receive an instant, shop-ready quote with a 50% deposit checkout\u2026",
  "sections": [
    {
      "type": "hero",
      "headline": "Design Your Exact Cabinets. Get a Quote Instantly.",
      "eyebrow": "Custom Cabinets. Engineered Online.",
      "subhead": "MillBuilt's browser-based 3D configurator lets you spec every dimension, finish, and hardware detail \u2014 then generates a shop-ready quote in seconds, with no drafting fees, no showroom appointments, and no guesswork.",
      "primaryCta": {
        "label": "Start Designing Free",
        "href": "/design"
      },
      "secondaryCta": {
        "label": "See How It Works",
        "href": "#how-it-works"
      },
      "image": {
        "url": "hero_image"
      }
    },
    {
      "type": "stats",
      "stats": [
        {
          "value": "$0",
          "label": "Design & drafting fee \u2014 always free"
        },
        {
          "value": "\u00b11 mm",
          "label": "Dimensional accuracy on every cut file"
        },
        {
          "value": "2\u20134 wks",
          "label": "Saved vs. traditional quote-to-drawing handoff"
        },
        {
          "value": "50%",
          "label": "Deposit to lock your order and enter production"
        }
      ],
      "title": "The Numbers Behind Every Build"
    },
    {
      "type": "how_it_works",
      "steps": [
        {
          "title": "Enter Your Dimensions",
          "body": "Input your wall runs, ceiling height, and opening locations. The configurator constrains every cabinet to your actual space \u2014 no rounding, no assumed standards."
        },
        {
          "title": "Configure Every Detail",
          "body": "Choose door style, wood species, finish, box depth, hinge side, drawer count, and hardware. Every selection updates your 3D model in real time using Mozaik's professional cabinet engine."
        },
        {
          "title": "Review Your Instant Quote",
          "body": "A fully itemized, shop-ready price is generated the moment your design is complete \u2014 line by line, cabinet by cabinet, with no hidden drafting or design surcharge."
        },
        {
          "title": "Deposit and We Build",
          "body": "Pay your 50% deposit at checkout and your cut files go straight to our CNC floor. Your cabinets are built to the exact spec you drew, shipped flat-pack and ready to install."
        }
      ],
      "title": "From Blank Room to Build-Ready in One Session",
      "subhead": "No sales rep. No waiting room. Just a precision tool that turns your measurements into a manufacturable cabinet set."
    },
    {
      "type": "feature_spotlight",
      "items": [
        {
          "title": "A Professional Cabinet Engine in Your Browser",
          "body": "MillBuilt's configurator is powered by Mozaik \u2014 the same parametric software used by production mill shops. Every door, drawer box, and face frame is engineered to real joinery tolerances, not approximated by a consumer rendering tool. What you see is exactly what gets cut.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/04eb10ec-5e3a-476f-b575-deac57ca229e",
            "alt": "A Professional Cabinet Engine in Your Browser"
          }
        },
        {
          "title": "Instant Quote, Zero Drafting Handoff",
          "body": "Every competitor charges $800\u2013$2,000 and 2\u20134 weeks to translate your wishlist into a drawing. MillBuilt eliminates that entirely. Your design is the drawing \u2014 and the moment it's complete, a fully itemized price is waiting. No email, no callback, no surprises.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/b04f7ff3-864d-4520-ab46-04eeacfcaea9",
            "alt": "Instant Quote, Zero Drafting Handoff"
          }
        },
        {
          "title": "Shop-Ready Files, Not a PDF",
          "body": "When you check out, your deposit doesn't fund a design phase \u2014 it funds production. Your confirmed order generates CNC-ready cut files that go directly to the mill floor, cutting lead time and eliminating transcription errors between what you ordered and what gets built.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/17daced9-03c4-44ff-a9e1-c27c65de9559",
            "alt": "Shop-Ready Files, Not a PDF"
          }
        }
      ],
      "title": "Where Precision Is the Product"
    },
    {
      "type": "feature_grid",
      "features": [
        {
          "title": "True Custom Sizing",
          "body": "Every cabinet is built to your millimeter specification. No forcing your 94.5\" run into a 90\" or 96\" box."
        },
        {
          "title": "Real-Time 3D Visualization",
          "body": "Rotate, zoom, and inspect your layout from any angle as you configure. Catch clearance issues before they become job-site problems."
        },
        {
          "title": "Material & Finish Library",
          "body": "Select from a curated range of wood species, MDF, thermofoil, and painted finishes \u2014 each mapped to real material costs in your quote."
        },
        {
          "title": "Door Style Catalog",
          "body": "Shaker, slab, raised-panel, and more \u2014 with accurate door profiles rendered on your cabinet faces so you see the finished look, not a placeholder."
        },
        {
          "title": "Itemized Line-Item Pricing",
          "body": "Your quote breaks down every cabinet individually \u2014 no lump-sum black box. Compare, adjust, and respec until the build fits your budget."
        },
        {
          "title": "Secure Deposit Checkout",
          "body": "50% deposit locks your exact design into production. The remaining balance is due before shipping \u2014 straightforward, no hidden fees."
        }
      ],
      "title": "Built for Renovators Who Know What They Want",
      "subhead": "Every feature is here because a homeowner or designer needed it \u2014 not because it looked good on a slide."
    },
    {
      "type": "social_proof",
      "quotes": [
        {
          "quote": "I got a quote from a big-box showroom for $28,000 and a four-week wait just to see drawings. MillBuilt had my full kitchen designed and priced in one evening. I ordered the next morning.",
          "author": "Homeowner, Chicago IL",
          "role": "Kitchen renovation, 22 linear feet"
        },
        {
          "quote": "The configurator is genuinely professional-grade. I've used Mozaik on the shop side \u2014 seeing it embedded in a client-facing tool that spits out an instant quote is a game changer for smaller remodel jobs.",
          "author": "Independent remodeling contractor",
          "role": "Mid-Atlantic region"
        },
        {
          "quote": "Every other custom option wanted me on a call before they'd show me a price. MillBuilt just let me design. The transparency alone made me trust the product before I even ordered.",
          "author": "Interior designer",
          "role": "Residential renovation, Denver CO"
        }
      ],
      "title": "What Renovators Say After Their First Quote"
    },
    {
      "type": "faq",
      "items": [
        {
          "q": "How is MillBuilt different from IKEA or Home Depot cabinets?",
          "a": "Big-box cabinets come in fixed sizes \u2014 you shim, scribe, and fill the gaps. MillBuilt builds every cabinet to your exact millimeter specification, so your layout fits your room, not the other way around. And unlike showroom custom, there's no drafting fee and no weeks-long design phase."
        },
        {
          "q": "Do I need any design experience to use the configurator?",
          "a": "No. The tool guides you through dimension entry, cabinet selection, and finish choices step by step. If you can measure a wall and know what style you like, you have everything you need to complete a design."
        },
        {
          "q": "What happens after I pay my deposit?",
          "a": "Your confirmed design generates CNC-ready cut files that go directly to our mill floor. We'll send you a production confirmation and estimated ship date. The remaining 50% balance is collected before your order ships."
        },
        {
          "q": "How are the cabinets delivered, and do you offer installation?",
          "a": "Cabinets ship flat-pack via freight carrier to any contiguous US address, packaged to withstand transit. MillBuilt does not provide installation \u2014 the cabinets are designed to be installed by your contractor or a skilled DIYer using standard methods."
        },
        {
          "q": "What if my measurements are off after I order?",
          "a": "Your submitted dimensions become the build spec \u2014 we manufacture exactly what you confirmed. We strongly recommend double-checking all measurements before checkout. If you discover an error before your order enters production, contact us immediately and we'll work to accommodate a revision."
        }
      ],
      "title": "Questions Worth Asking Before You Order"
    },
    {
      "type": "cta_band",
      "headline": "Your Kitchen Shouldn't Be Built Around a Standard Size.",
      "subhead": "Open the configurator, enter your dimensions, and have a shop-ready quote before your next contractor call \u2014 at no cost, no commitment."
    }
  ]
};
