"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmRequest {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="border border-white/15 bg-black">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl font-normal">
            {request?.title}
          </AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              request?.onConfirm();
              onClose();
            }}
          >
            {request?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
