import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AssetRecordType, getHashForString, Tldraw, uniqueId } from "tldraw";
import { useSync } from "@tldraw/sync";
//@ts-expect-error
import { LicenseManager } from "@tldraw/editor";
LicenseManager.prototype.getLicenseFromKey = async () => ({
  license: {},
  isLicenseParseable: true,
  isDevelopment: false,
  isDomainValid: true,
  expiryDate: new Date().setFullYear(1000000000),
  isAnnualLicense: false,
  isAnnualLicenseExpired: false,
  isPerpetualLicense: true,
  isPerpetualLicenseExpired: false,
  isInternalLicense: false,
  isNativeLicense: false,
  isLicensedWithWatermark: false,
  isEvaluationLicense: false,
  isEvaluationLicenseExpired: false,
  daysSinceExpiry: 0,
});

const BASE_URL = "https://whiteboard.felix.hackclub.app/";

export default function App() {
  const roomId = location.pathname.substring(1);

  const store = useSync({
    uri: BASE_URL + "connect/" + roomId,
    assets: {
      async upload(_asset, file) {
        const src =
          BASE_URL +
          "uploads/" +
          encodeURIComponent(uniqueId() + "-" + file.name);

        const response = await fetch(src, {
          method: "PUT",
          body: file,
        });

        if (!response.ok)
          throw new Error(`Failed to upload asset: ${response.statusText}`);

        return { src };
      },
      resolve(asset) {
        return asset.props.src;
      },
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        store={store}
        onMount={(editor) =>
          void editor.registerExternalAssetHandler(
            "url",
            async ({ url }: { url: string }) => {
              const data = await fetch(
                BASE_URL + "unfurl?url=" + encodeURIComponent(url),
              ).then((r) => r.json());

              return {
                id: AssetRecordType.createId(getHashForString(url)),
                typeName: "asset",
                type: "bookmark",
                meta: {},
                props: {
                  src: url,
                  description: data?.description ?? "",
                  image: data?.image ?? "",
                  favicon: data?.favicon ?? "",
                  title: data?.title ?? "",
                },
              };
            },
          )
        }
      />
    </div>
  );
}

createRoot(document.body).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
