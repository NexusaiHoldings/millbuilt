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
          href: "/admin/orders",
          adminOnly: true,
        },
        {
          label: "Materials",
          href: "/admin/materials",
          adminOnly: true,
        },
        {
          label: "Pricing",
          href: "/pricing",
          adminOnly: true,
        },
        {
          label: "Partners",
          href: "/partners",
          adminOnly: true,
        },
      ],
    },
  ],
};
