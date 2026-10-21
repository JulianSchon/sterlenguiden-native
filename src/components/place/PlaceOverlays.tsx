/**
 * Det som öppnas ovanpå platssidan: bilderna i helskärm och panelerna (Spara i lista, Vänner här,
 * Stämmer något inte?). Sidan öppnar dem via ref — att öppna dem ritar bara om dem själva, inte
 * sidan. När hela sidan ritades om vid öppningen hann panelens glidning upp hacka.
 */
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { useRouter } from "expo-router";
import { useFriendsAtPlace } from "@/hooks/useFriendsAtPlace";
import { pushOnce } from "@/lib/navigateOnce";
import { SaveToListSheet } from "@/components/lists/SaveToListSheet";
import { PhotoViewer } from "./PhotoViewer";
import { FriendsSheet } from "./PlaceSocial";
import { ReportSheet } from "./ReportSheet";

export interface PhotoViewerHandle { open: (index: number) => void }

/** Bilderna i helskärm. Stängs den på en annan bild hoppar sidans bildspel dit (onClose) */
export const PhotoViewerHost = forwardRef<PhotoViewerHandle, { images: string[]; onClose: (index: number) => void }>(
  function PhotoViewerHost({ images, onClose }, ref) {
    const [start, setStart] = useState<number | null>(null);
    useImperativeHandle(ref, () => ({ open: setStart }), []);
    const close = useCallback((i: number) => {
      setStart(null);
      onClose(i);
    }, [onClose]);
    return <PhotoViewer images={images} start={start ?? 0} visible={start != null} onClose={close} />;
  },
);

export type PlaceSheet = "save" | "friends" | "report";
export interface PlaceSheetsHandle { open: (sheet: PlaceSheet) => void }

export const PlaceSheets = forwardRef<PlaceSheetsHandle, { placeId: number }>(function PlaceSheets({ placeId }, ref) {
  const router = useRouter();
  const { data: friends = [] } = useFriendsAtPlace(placeId);
  const [open, setOpen] = useState<PlaceSheet | null>(null);
  // Tipsa oss börjar alltid tom: en ny panel varje gång (inget ritas om medan den glider upp)
  const [reportKey, setReportKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open: (sheet: PlaceSheet) => {
      if (sheet === "report") setReportKey((k) => k + 1);
      setOpen(sheet);
    },
  }), []);
  const close = useCallback(() => setOpen(null), []);
  const openFriend = useCallback((userId: string) => {
    setOpen(null);
    router.push({ pathname: "/friend/[id]", params: { id: userId } });
  }, [router]);
  const openList = useCallback((listId: string) => {
    setOpen(null);
    pushOnce(router, `/lists/${listId}`);
  }, [router]);

  return (
    <>
      <SaveToListSheet visible={open === "save"} onClose={close} placeId={placeId} onOpenList={openList} />
      <FriendsSheet visible={open === "friends"} friends={friends} onClose={close} onOpenFriend={openFriend} />
      <ReportSheet key={reportKey} visible={open === "report"} placeId={placeId} onClose={close} />
    </>
  );
});
