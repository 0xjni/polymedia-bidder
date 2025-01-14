export type DisplaySvgProps = {
    backgroundColor: string;
    titleColor: string;
    titleSize: number;
    titleLine1: string;
    titleLine2?: string;
    fontFamily?: string;
    logo?: {
        name: string;
        borderColor: string;
        textColor: string;
        textSize: number;
    };
};

export function makeDisplaySvg({
    backgroundColor,
    titleColor,
    titleSize,
    titleLine1,
    titleLine2 = "",
    fontFamily = "system-ui,sans-serif",
    logo,
}: DisplaySvgProps): string
{
    return `
    <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="${backgroundColor}"/>
        <text
            x="50"
            y="50"
            font-family="${fontFamily}"
            font-size="${titleSize}"
            font-weight="bold"
            fill="${titleColor}"
            text-anchor="middle"
            dominant-baseline="middle"
        >
            <tspan x="50" dy="${titleLine2 ? "-0.5em" : "0"}">${titleLine1}</tspan>
            ${titleLine2 ? `<tspan x="50" dy="1.3em">${titleLine2}</tspan>` : ""}
        </text>
        ${logo ? `
        <text
            x="94"
            y="94"
            font-family="${fontFamily}"
            font-size="${logo.textSize}"
            font-weight="bold"
            text-anchor="end"
            dominant-baseline="text-bottom"
        >
            <tspan
                fill="${logo.textColor}"
                stroke="${logo.borderColor}"
                stroke-width="${fmtNum(logo.textSize * 0.1)}"
                paint-order="stroke"
            >${logo.name}</tspan>
        </text>
        ` : ""}
    </svg>`.trim();
}

export function trimSvg(svg: string): string
{
    return svg
        .replace(/\n/g, "")             // remove newlines
        .replace(/:\s+/g, ":")          // remove space after colons in CSS styles
        .replace(/\s*;\s*/g, ";")       // remove unnecessary spaces around semicolons in CSS
        .replace(/\s+/g, " ")           // replace multiple whitespace characters with a single space
        .replace(/>\s+</g, "><")        // remove whitespace between tags
        .replace(/\s*([<>])\s*/g, "$1") // remove spaces around opening and closing angle brackets
        .trim();                        // trim any leading or trailing whitespace
};

export function svgToDataUrl(svg: string): string
{
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const getRandomDarkColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = Math.floor(Math.random() * 30) + 70; // 70-100%
    const l = Math.floor(Math.random() * 20) + 10; // 10-30%
    return `hsl(${h}, ${s}%, ${l}%)`;
};

export const getRandomLightColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = Math.floor(Math.random() * 30) + 70; // 70-100%
    const l = Math.floor(Math.random() * 20) + 70; // 70-90%
    return `hsl(${h}, ${s}%, ${l}%)`;
};

function fmtNum( // copied from fractals.ts
    num: number,
    decimals = 2,
): string
{
    return num.toFixed(decimals)
        .replace(/\.0+$/, "") // remove trailing zeros like "7.00" -> "7"
        .replace(/(\.\d*?[1-9])0+$/, "$1"); // remove trailing zeros like "7.50" => "7.5"
}
