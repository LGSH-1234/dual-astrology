// 摘自 react-iztro src/Iztrolabe/Iztrolabe.tsx（MIT，© 2023 Sylar Long）
// 本项目改动：
// 1. 不用 iztro-hook，直接接收本项目按真太阳时排好的 astrolabe；
// 2. 去掉安星算法 / 排盘类型切换（固定通行版）；
// 3. 增加 selected / onSelect，用于右侧宫位详情。
// 排版、交互状态（太极点、宫干四化、运限显隐）和原版一致。
import React, { useEffect, useMemo, useState } from "react";
import { Izpalace } from "../Izpalace/Izpalace";
import { IzpalaceCenter } from "../IzpalaceCenter";
import classNames from "../cx";
import "./Iztrolabe.css";
import "../theme/default.css";
import type FunctionalAstrolabe from "iztro/lib/astro/FunctionalAstrolabe";
import type { Scope } from "iztro/lib/data/types";
import type { HeavenlyStemKey } from "iztro/lib/i18n";
import { getPalaceNames } from "iztro/lib/astro";
import "../locales";

export type IztrolabeProps = {
  astrolabe: FunctionalAstrolabe;
  horoscopeDate?: string | Date;
  horoscopeHour?: number;
  centerPalaceAlign?: boolean;
  selected?: number;
  onSelect?: (index: number) => void;
};

export const Iztrolabe: React.FC<IztrolabeProps> = (props) => {
  const { astrolabe } = props;
  const [taichiPoint, setTaichiPoint] = useState(-1);
  const [taichiPalaces, setTaichiPalaces] = useState<undefined | string[]>();
  const [activeHeavenlyStem, setActiveHeavenlyStem] = useState<HeavenlyStemKey>();
  const [hoverHeavenlyStem, setHoverHeavenlyStem] = useState<HeavenlyStemKey>();
  const [focusedIndex, setFocusedIndex] = useState<number>();
  const [showDecadal, setShowDecadal] = useState(false);
  const [showYearly, setShowYearly] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [showHourly, setShowHourly] = useState(false);
  const [horoscopeDate, setHoroscopeDate] = useState<string | Date>();
  const [horoscopeHour, setHoroscopeHour] = useState<number>();

  const horoscope = useMemo(
    () => astrolabe.horoscope(horoscopeDate ?? new Date(), horoscopeHour ?? 0),
    [astrolabe, horoscopeDate, horoscopeHour]
  );

  const toggleShowScope = (scope: Scope) => {
    switch (scope) {
      case "decadal":
        setShowDecadal(!showDecadal);
        break;
      case "yearly":
        setShowYearly(!showYearly);
        break;
      case "monthly":
        setShowMonthly(!showMonthly);
        break;
      case "daily":
        setShowDaily(!showDaily);
        break;
      case "hourly":
        setShowHourly(!showHourly);
        break;
    }
  };

  const toggleActiveHeavenlyStem = (heavenlyStem: HeavenlyStemKey) => {
    setActiveHeavenlyStem(heavenlyStem === activeHeavenlyStem ? undefined : heavenlyStem);
  };

  const dynamic = useMemo(() => {
    if (showHourly) return { arrowIndex: horoscope?.hourly.index, arrowScope: "hourly" as Scope };
    if (showDaily) return { arrowIndex: horoscope?.daily.index, arrowScope: "daily" as Scope };
    if (showMonthly) return { arrowIndex: horoscope?.monthly.index, arrowScope: "monthly" as Scope };
    if (showYearly) return { arrowIndex: horoscope?.yearly.index, arrowScope: "yearly" as Scope };
    if (showDecadal) return { arrowIndex: horoscope?.decadal.index, arrowScope: "decadal" as Scope };
    // 本项目改动：没有打开运限时，三方四正连线跟随选中宫位
    if (props.selected !== undefined) return { arrowIndex: props.selected, arrowScope: undefined };
  }, [showDecadal, showYearly, showMonthly, showDaily, showHourly, horoscope, props.selected]);

  useEffect(() => {
    setHoroscopeDate(props.horoscopeDate ?? new Date());
    setHoroscopeHour(props.horoscopeHour ?? 0);
  }, [props.horoscopeDate, props.horoscopeHour]);

  useEffect(() => {
    setTaichiPalaces(taichiPoint < 0 ? undefined : getPalaceNames(taichiPoint));
  }, [taichiPoint]);

  const toggleTaichiPoint = (index: number) => {
    setTaichiPoint(taichiPoint === index ? -1 : index);
  };

  return (
    <div
      className={classNames("iztro-astrolabe", "iztro-astrolabe-theme-default")}
      role="group"
      aria-label="紫微十二宫命盘"
      data-testid="ziwei-grid"
    >
      {astrolabe.palaces.map((palace) => (
        <Izpalace
          key={palace.earthlyBranch}
          focusedIndex={focusedIndex ?? props.selected}
          onFocused={setFocusedIndex}
          horoscope={horoscope}
          showDecadalScope={showDecadal}
          showYearlyScope={showYearly}
          showMonthlyScope={showMonthly}
          showDailyScope={showDaily}
          showHourlyScope={showHourly}
          taichiPalace={taichiPalaces?.[palace.index]}
          toggleScope={toggleShowScope}
          activeHeavenlyStem={activeHeavenlyStem}
          toggleActiveHeavenlyStem={toggleActiveHeavenlyStem}
          hoverHeavenlyStem={hoverHeavenlyStem}
          setHoverHeavenlyStem={setHoverHeavenlyStem}
          toggleTaichiPoint={toggleTaichiPoint}
          selected={props.selected === palace.index}
          onSelect={props.onSelect}
          {...palace}
        />
      ))}
      <IzpalaceCenter
        astrolabe={astrolabe}
        horoscope={horoscope}
        horoscopeDate={horoscopeDate}
        horoscopeHour={horoscopeHour}
        setHoroscopeDate={setHoroscopeDate}
        setHoroscopeHour={setHoroscopeHour}
        centerPalaceAlign={props.centerPalaceAlign}
        lang="zh-CN"
        {...dynamic}
      />
    </div>
  );
};
