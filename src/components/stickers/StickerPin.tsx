/**
 * Kartnål för ett samlarobjekt. Alltid lila; ljusare om man inte har stickern
 * än, mörkare och mer fylld om man har den.
 */
import Svg, { Path, Polygon } from "react-native-svg";

const STAR = "12,5.8 13.5,9.2 17.2,9.6 14.4,12.1 15.2,15.8 12,13.9 8.8,15.8 9.6,12.1 6.8,9.6 10.5,9.2";

export function StickerPin({ collected, selected = false }: { collected: boolean; selected?: boolean }) {
  const scale = selected ? 1.35 : 1;
  return (
    <Svg width={28 * scale} height={36 * scale} viewBox="0 0 24 32">
      <Path
        d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z"
        fill={collected ? "#5B21B6" : "#A78BFA"}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={1}
      />
      <Polygon points={STAR} fill={collected ? "#FDE68A" : "#FFFFFF"} />
    </Svg>
  );
}
