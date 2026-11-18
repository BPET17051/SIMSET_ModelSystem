const url = 'https://ifogcvymwhcfbfjzhwsl.supabase.co/rest/v1';
const key = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';

async function test() {
    const mRes = await fetch(`${url}/manikins?select=*&is_active=eq.false&needs_review=eq.true&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const m = await mRes.json();
    const r = m[0];
    console.log("sap_id: " + r.sap_id);
    console.log("asset_name: " + r.asset_name);
    console.log("note: " + r.note);
    console.log("remark: " + r.remark);
    console.log("location_id: " + r.location_id);

    // check all keys that have value
    const keysWithValue = Object.keys(r).filter(k => r[k] !== null && r[k] !== '');
    console.log("Keys with value:", keysWithValue.join(", "));
}
test();
