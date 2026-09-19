/* Resize only public product photos; keep originals as a one-time fallback. */
function carolaImageUrl(source, width) {
  if (!/^https:\/\/gfkjdpuhbxfwajbkzfap\.supabase\.co\/storage\/v1\/object\/public\/Productos\//.test(source || '')) return source;
  return '/.netlify/images?url=' + encodeURIComponent(source) + '&w=' + width + '&fit=contain&q=80';
}
function carolaImageSet(source, widths) {
  return widths.map(width => carolaImageUrl(source, width) + ' ' + width + 'w').join(', ');
}
function carolaSetImage(image, source) {
  image.dataset.original = source;
  image.srcset = carolaImageSet(source, [480, 800, 1200]);
  image.src = carolaImageUrl(source, 800);
  image.style.opacity = '1';
}
document.addEventListener('error', function(event) {
  const image = event.target;
  if (image.tagName !== 'IMG' || !image.dataset.original) return;
  const original = image.dataset.original;
  delete image.dataset.original;
  image.removeAttribute('srcset');
  image.src = original;
}, true);
