import logoUrl from "../../assets/ringnex.png";

/**
 * ringNex wordmark. The source PNG is a wide lockup (~3.5:1), so height is
 * the control dimension and width follows. Use `className` for extra layout
 * (margins, etc.).
 */
export default function Logo({ height = 26, className = "" }) {
  return (
    <img
      src={logoUrl}
      alt="ringNex"
      height={height}
      style={{ height, width: "auto" }}
      className={"block select-none " + className}
      draggable={false}
    />
  );
}

export { logoUrl };
