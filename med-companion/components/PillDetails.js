export default function PillDetails({ med, onChange }) {
  async function photo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 600000) {
      alert('Choose a JPG, PNG or WebP photo smaller than 600 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({ pillPhoto: reader.result });
    reader.readAsDataURL(file);
  }
  return <fieldset style={{ margin: '12px 0' }}>
    <legend>Pill / blister pack reference</legend>
    <label>Imprint or score <input value={med.pillImprint || ''} onChange={e => onChange({ pillImprint: e.target.value })} placeholder="e.g. M 500, scored" /></label>
    <label>Photo <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={photo} /></label>
    {med.pillPhoto && <><img src={med.pillPhoto} alt="Actual pill or blister pack" style={{ width: 100, height: 100, objectFit: 'contain' }} /><button type="button" onClick={() => onChange({ pillPhoto: '' })}>Remove photo</button></>}
  </fieldset>;
}
