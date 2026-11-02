import type { LinkComponentProps } from "@cloudflare/kumo";
import { Link } from "@tanstack/react-router";
import { forwardRef } from "react";

/** Lets Kumo's `href` links navigate with the router, for use with Kumo's `LinkProvider`. */
export const RouterLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  ({ href = "", ...rest }, ref) => <Link {...rest} ref={ref} to={href} />,
);
