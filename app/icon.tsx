import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 240,
          fontWeight: 800,
          borderRadius: 120,
          letterSpacing: -12,
        }}
      >
        FS
      </div>
    ),
    size
  );
}
