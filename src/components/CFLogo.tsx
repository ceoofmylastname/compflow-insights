interface CFLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-14 w-14 text-xl",
};

const CFLogo = ({ size = "md", className = "" }: CFLogoProps) => {
  return (
    <div
      className={`${sizes[size]} flex items-center justify-center rounded-lg bg-primary font-extrabold tracking-tight text-primary-foreground ${className}`}
    >
      CF
    </div>
  );
};

export default CFLogo;
