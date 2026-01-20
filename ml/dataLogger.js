/*************************************************
 * ML Data Logger
 *************************************************/

export function logJabSample(sample) {
    const existing =
        JSON.parse(localStorage.getItem("jab_samples") || "[]");

    existing.push(sample);

    localStorage.setItem(
        "jab_samples",
        JSON.stringify(existing)
    );
}
