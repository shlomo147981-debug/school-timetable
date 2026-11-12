'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * התאמות שפועלות רק בתוך מעטפת האנדרואיד (Capacitor). בדפדפן רגיל — לא עושה כלום.
 *  - כפתור "חזור" של אנדרואיד: סוגר מודאל פתוח → חוזר אחורה בהיסטוריה → יוצא מהאפליקציה.
 *  - מוסיף class "native" ל-<html> לצורך התאמות CSS.
 */
export default function MobileBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add('native');

    const sub = App.addListener('backButton', ({ canGoBack }) => {
      const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      if (openDialog) openDialog.close();
      else if (canGoBack) history.back();
      else App.exitApp();
    });
    return () => { sub.then((s) => s.remove()); };
  }, []);
  return null;
}
