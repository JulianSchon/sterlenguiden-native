/** Lägg till platser i en lista. */
import { useAddPlaceToList } from "@/hooks/useLists";
import { PlacePickerSheet } from "@/components/PlacePickerSheet";

export function AddPlaceSheet({
  visible, onClose, listId, existingPlaceIds,
}: { visible: boolean; onClose: () => void; listId: string; existingPlaceIds: number[] }) {
  const add = useAddPlaceToList();
  return (
    <PlacePickerSheet
      visible={visible}
      onClose={onClose}
      title="Lägg till plats"
      selectedIds={existingPlaceIds}
      onPick={(place) => add.mutate({ listId, placeId: place.id })}
    />
  );
}
