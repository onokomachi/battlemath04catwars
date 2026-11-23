import React from 'react';
import { TerrainTile } from '../../types';

interface Props {
  terrain: TerrainTile[];
  cellSize?: number;
}

export const TerrainLayer: React.FC<Props> = ({ terrain, cellSize = 40 }) => {
  return (
    <>
      {terrain.map(tile => {
        const isWater = tile.type === 'WATER';
        const isBridge = tile.type === 'BRIDGE';
        const isRock = tile.type === 'ROCK';
        const isSwamp = tile.type === 'SWAMP';
        const isLava = tile.type === 'LAVA';

        return (
          <div
            key={`${tile.x}-${tile.y}`}
            style={{
              position: 'absolute',
              left: tile.x * cellSize,
              top: tile.y * cellSize,
              width: cellSize,
              height: cellSize,
              pointerEvents: 'none',
              zIndex: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: cellSize * 0.5,
              // 水はもともと CSS クラス .terrain-water 頼みだったが、そのクラスが
              // どこにも定義されておらず、川が透明で見えていなかった。インラインで描く。
              background: isWater
                ? 'linear-gradient(180deg, #1e40af 0%, #1d4ed8 45%, #1e3a8a 100%)'
                : isBridge ? '#92400e'
                : isRock ? '#374151'
                : isSwamp ? 'rgba(20,83,45,0.8)'
                : isLava ? 'radial-gradient(circle at 40% 35%, #fb923c, #b91c1c 55%, #7f1d1d)'
                : 'transparent',
              border: isBridge ? '1px solid rgba(120,53,15,0.6)' : 'none',
              boxShadow: isRock ? 'inset 0 0 8px rgba(0,0,0,0.5)'
                : isWater ? 'inset 0 0 10px rgba(0,0,0,0.45)'
                : isLava ? 'inset 0 0 10px rgba(0,0,0,0.55), 0 0 10px rgba(251,146,60,0.45)' : undefined,
            }}
          >
            {isWater && <span style={{ fontSize: Math.max(12, cellSize * 0.42), opacity: 0.75, lineHeight: 1 }}>🌊</span>}
            {isRock && <span style={{ fontSize: Math.max(12, cellSize * 0.4), lineHeight: 1 }}>🪨</span>}
            {isSwamp && <span style={{ fontSize: Math.max(12, cellSize * 0.4), opacity: 0.6, lineHeight: 1 }}>🌿</span>}
            {isLava && <span style={{ fontSize: Math.max(12, cellSize * 0.42), opacity: 0.85, lineHeight: 1 }}>🔥</span>}
            {isBridge && (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'repeating-linear-gradient(90deg, #92400e 0px, #92400e 4px, #78350f 4px, #78350f 8px)',
                opacity: 0.9,
              }} />
            )}
          </div>
        );
      })}
    </>
  );
};
