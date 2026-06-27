export type NavLink = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

export type NavConfig = {
  primary: NavLink[];
  groups: NavGroup[];
};

export const NAV_CONFIG: NavConfig = {
  primary: [
    {
      label: "Configure",
      href: "/design",
    },
    {
      label: "Materials",
      href: "/materials",
    },
    {
      label: "My Orders",
      href: "/orders",
    },
  ],
  groups: [
    {
      label: "Operator",
      links: [
        {
          label: "Orders",
          href: "/operator/orders",
        },
        {
          label: "Materials",
          href: "/admin/materials",
        },
        {
          label: "Pricing",
          href: "/operator/pricing",
        },
        {
          label: "Partners",
          href: "/operator/partners",
        },
      ],
    },
  ],
};
