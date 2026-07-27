import React from 'react';
import { uploadBlogImage } from '../../../api/clubPmClient';

// Shared "pick a file, upload it, hand back the URL" flow for every blog image
// slot. Creating the input on demand keeps call sites free of hidden <input>
// JSX, refs, and the e.target.value='' reset dance.
//
// pickImage() resolves { url, width, height } on success, or null if the user
// cancelled or the upload failed (failures are reported here, once).
export default function useImageUpload() {
  const [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const pickImage = React.useCallback(() => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      setBusy(true);
      try {
        finish(await uploadBlogImage(file));
      } catch (err) {
        console.error('[blog] image upload failed:', err);
        window.alert('Image upload failed. Please try again.');
        finish(null);
      } finally {
        if (mounted.current) setBusy(false);
      }
    });

    input.click();
  }), []);

  return { busy, pickImage };
}
