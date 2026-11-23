import React from 'react';
import { BuildingType } from '../../types';

/** 施設の絵（public/assets/sprites/）。陣地づくり・ホーム・ステージで 絵文字のかわりに使う */
export const FACILITY_SPRITE: Record<BuildingType, string> = {
  [BuildingType.TOWN_HALL]: '/assets/sprites/town-hall.png',
  [BuildingType.GOLD_MINE]: '/assets/sprites/gold-mine.png',
  [BuildingType.BARRACKS]: '/assets/sprites/barracks.png',
  [BuildingType.ARMY_CAMP]: '/assets/sprites/army-camp.png',
  [BuildingType.WALL]: '/assets/sprites/wall.png',
  [BuildingType.CANNON]: '/assets/sprites/cannon.png',
  [BuildingType.HIDDEN_TESLA]: '/assets/sprites/hidden-tesla.png',
};

export const FacilityImg: React.FC<{ type: BuildingType; size?: number; className?: string; style?: React.CSSProperties }> = ({ type, size = 28, className, style }) => (
  <img src={FACILITY_SPRITE[type]} alt="" draggable={false} width={size} height={size} className={className}
    style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, ...style }} />
);
