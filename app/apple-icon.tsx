import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #2563eb 0%, #4f46e5 52%, #7c3aed 100%)',
          color: 'white',
          fontSize: 84,
          fontWeight: 800,
          borderRadius: 42,
          letterSpacing: -4,
        }}
      >
        FS
      </div>
    ),
    size
  );
}
