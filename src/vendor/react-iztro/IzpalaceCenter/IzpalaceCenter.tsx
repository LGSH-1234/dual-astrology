import classNames from "../cx";
import React, { useCallback, useMemo } from "react";
import FunctionalAstrolabe from "iztro/lib/astro/FunctionalAstrolabe";
import { Item, ItemProps } from "./Item";
import "./IzpalaceCenter.css";
import { Line } from "./Line";
import { fixEarthlyBranchIndex } from "iztro/lib/utils";
import { Language, Scope } from "iztro/lib/data/types";
import { IFunctionalHoroscope } from "iztro/lib/astro/FunctionalHoroscope";
import { normalizeDateStr, solar2lunar } from "lunar-lite";
import i18next, { GenderName, kot, t } from "iztro/lib/i18n";
import { CHINESE_TIME } from "iztro/lib/data";
import { toLocaleLunarStr } from "../locales";

type IzpalaceCenterProps = {
  astrolabe?: FunctionalAstrolabe;
  horoscope?: IFunctionalHoroscope;
  horoscopeDate?: string | Date;
  horoscopeHour?: number;
  arrowIndex?: number;
  arrowScope?: Scope;
  setHoroscopeDate?: React.Dispatch<
    React.SetStateAction<string | Date | undefined>
  >;
  setHoroscopeHour?: React.Dispatch<React.SetStateAction<number | undefined>>;
  centerPalaceAlign?: boolean;
  lang: Language;
};

export const IzpalaceCenter = ({
  astrolabe,
  horoscope,
  arrowIndex,
  arrowScope,
  horoscopeDate = new Date(),
  horoscopeHour = 0,
  setHoroscopeDate,
  setHoroscopeHour,
  centerPalaceAlign,
  lang,
}: IzpalaceCenterProps) => {
  const records: ItemProps[] = useMemo(
    () => [
      {
        title: i18next.t("react:labelElementType"),
        content: astrolabe?.fiveElementsClass,
      },
      {
        title: i18next.t("react:labelNominalAge"),
        content: i18next.t("react:age", { age: horoscope?.age.nominalAge ?? "" }),
      },
      {
        title: i18next.t("react:labelFourPillars"),
        content: astrolabe?.chineseDate,
      },
      {
        title: i18next.t("react:labelSolarCalendar"),
        content: astrolabe?.solarDate,
      },
      {
        title: i18next.t("react:labelLunarCalendar"),
        content: astrolabe?.lunarDate && astrolabe?.rawDates.lunarDate &&
          toLocaleLunarStr(astrolabe.lunarDate, astrolabe.rawDates.lunarDate, lang),
      },
      {
        title: i18next.t("react:labelChineseHour"),
        content: `${astrolabe?.time}(${astrolabe?.timeRange})`,
      },
      {
        title: i18next.t("react:labelChineseZodiacSign"),
        content: astrolabe?.zodiac,
      },
      {
        title: i18next.t("react:labelZodiacSign"),
        content: astrolabe?.sign,
      },
      {
        title: i18next.t("react:labelSoulRuler"),
        content: astrolabe?.soul,
      },
      {
        title: i18next.t("react:labelBodyRuler"),
        content: astrolabe?.body,
      },
      {
        title: i18next.t("react:labelSoulPalace"),
        content: astrolabe?.earthlyBranchOfSoulPalace,
      },
      {
        title: i18next.t("react:labelBodyPalace"),
        content: astrolabe?.earthlyBranchOfBodyPalace,
      },
    ],
    [astrolabe, horoscope, lang]
  );

  const horoDate = useMemo(() => {
    const dateStr = horoscopeDate ?? new Date();
    const [year, month, date] = normalizeDateStr(dateStr);
    const dt = new Date(year, month - 1, date);
    const lunarDate = solar2lunar(dateStr)
    const lunarStr = lunarDate.toString(true)
    return {
      solar: `${year}-${month}-${date}`,
      lunar: toLocaleLunarStr(lunarStr, lunarDate, lang),
      prevDecadalDisabled: dt.setFullYear(dt.getFullYear() - 1),
    };
  }, [horoscopeDate, lang]);

  const onHoroscopeButtonClicked = (scope: Scope, value: number) => {
    if (!astrolabe?.solarDate) {
      return true;
    }

    const [year, month, date] = normalizeDateStr(horoscopeDate);
    const dt = new Date(year, month - 1, date);
    const [birthYear, birthMonth, birthDate] = normalizeDateStr(
      astrolabe.solarDate
    );
    const birthday = new Date(birthYear, birthMonth - 1, birthDate);
    let hour = horoscopeHour;

    switch (scope) {
      case "hourly":
        hour = horoscopeHour + value;

        if (horoscopeHour + value > 11) {
          // 如果大于亥时，则加一天，时辰变为早子时
          dt.setDate(dt.getDate() + 1);
          hour = 0;
        } else if (horoscopeHour + value < 0) {
          // 如果小于早子时，则减一天，时辰变为亥时
          dt.setDate(dt.getDate() - 1);
          hour = 11;
        }
        break;
      case "daily":
        dt.setDate(dt.getDate() + value);
        break;
      case "monthly":
        dt.setMonth(dt.getMonth() + value);
        break;
      case "yearly":
      case "decadal":
        dt.setFullYear(dt.getFullYear() + value);
        break;
    }

    if (dt.getTime() >= birthday.getTime()) {
      setHoroscopeDate?.(dt);
      setHoroscopeHour?.(hour);
    }
  };

  const shouldBeDisabled = useCallback(
    (dateStr: string | Date, scope: Scope, value: number) => {
      if (!astrolabe?.solarDate) {
        return true;
      }

      const [year, month, date] = normalizeDateStr(dateStr);
      const dt = new Date(year, month - 1, date);
      const [birthYear, birthMonth, birthDate] = normalizeDateStr(
        astrolabe.solarDate
      );
      const birthday = new Date(birthYear, birthMonth - 1, birthDate);

      switch (scope) {
        case "hourly":
          if (horoscopeHour + value > 11) {
            dt.setDate(dt.getDate() + 1);
          } else if (horoscopeHour + value < 0) {
            dt.setDate(dt.getDate() - 1);
          }

          break;
        case "daily":
          dt.setDate(dt.getDate() + value);
          break;
        case "monthly":
          dt.setMonth(dt.getMonth() + value);
          break;
        case "yearly":
        case "decadal":
          dt.setFullYear(dt.getFullYear() + value);
          break;
      }

      if (dt.getTime() < birthday.getTime()) {
        return true;
      }

      return false;
    },
    [horoscopeHour, astrolabe]
  );

  return (
    <div
      className={classNames("iztro-center-palace", {
        "iztro-center-palace-centralize": centerPalaceAlign,
      })}
    >
      {astrolabe?.earthlyBranchOfSoulPalace && (
        <Line
          scope={arrowScope}
          index={
            arrowIndex ??
            fixEarthlyBranchIndex(astrolabe.earthlyBranchOfSoulPalace)
          }
        />
      )}
      <h3 className="center-title">
        <span
          className={`gender gender-${kot<GenderName>(
            astrolabe?.gender ?? ""
          )}`}
        >
          {kot<GenderName>(astrolabe?.gender ?? "") === "male" ? "♂" : "♀"}
        </span>
        <span>{i18next.t("react:titleBasicInfo")}</span>
      </h3>
      <ul className="basic-info">
        {records.map((rec, idx) => (
          <Item key={idx} {...rec} />
        ))}
      </ul>
      <h3 className="center-title">{i18next.t("react:titleHoroscopeInfo")}</h3>
      <ul className="basic-info">
        <Item title={i18next.t("react:labelLunarCalendar")} content={horoDate.lunar} />
        <div
          className={classNames("solar-horoscope", {
            "solar-horoscope-centralize": centerPalaceAlign,
          })}
        >
          <Item title={i18next.t("react:labelSolarCalendar")} content={horoDate.solar} />
          <span
            className="today"
            onClick={() => setHoroscopeDate?.(new Date())}
          >
            {i18next.t("react:buttonNow")}
          </span>
        </div>
      </ul>
      <div className="horo-buttons">
        <span
          className={classNames("center-button", {
            disabled: shouldBeDisabled(horoDate.solar, "yearly", -10),
          })}
          onClick={() => onHoroscopeButtonClicked("yearly", -10)}
        >
          ◀{i18next.t("react:buttonDecade")}
        </span>
        <span
          className={classNames("center-button", {
            disabled: shouldBeDisabled(horoDate.solar, "yearly", -1),
          })}
          onClick={() => onHoroscopeButtonClicked("yearly", -1)}
        >
          ◀{i18next.t("react:buttonYear")}
        </span>
        <span
          className={classNames("center-button", {
            disabled: shouldBeDisabled(horoDate.solar, "monthly", -1),
          })}
          onClick={() => onHoroscopeButtonClicked("monthly", -1)}
        >
          ◀{i18next.t("react:buttonMonth")}
        </span>
        <span
          className={classNames("center-button", {
            disabled: shouldBeDisabled(horoDate.solar, "daily", -1),
          })}
          onClick={() => onHoroscopeButtonClicked("daily", -1)}
        >
          ◀{i18next.t("react:buttonDay")}
        </span>
        <span
          className={classNames("center-button", {
            disabled: shouldBeDisabled(horoDate.solar, "hourly", -1),
          })}
          onClick={() => onHoroscopeButtonClicked("hourly", -1)}
        >
          ◀{i18next.t("react:buttonHour")}
        </span>
        <span className="center-horo-hour">
          {t(CHINESE_TIME[horoscopeHour])}
        </span>
        <span
          className={classNames("center-button")}
          onClick={() => onHoroscopeButtonClicked("hourly", 1)}
        >
          {i18next.t("react:buttonHour")}▶
        </span>
        <span
          className={classNames("center-button")}
          onClick={() => onHoroscopeButtonClicked("daily", 1)}
        >
          {i18next.t("react:buttonDay")}▶
        </span>
        <span
          className={classNames("center-button")}
          onClick={() => onHoroscopeButtonClicked("monthly", 1)}
        >
          {i18next.t("react:buttonMonth")}▶
        </span>
        <span
          className={classNames("center-button")}
          onClick={() => onHoroscopeButtonClicked("yearly", 1)}
        >
          {i18next.t("react:buttonYear")}▶
        </span>
        <span
          className={classNames("center-button")}
          onClick={() => onHoroscopeButtonClicked("yearly", 10)}
        >
          {i18next.t("react:buttonDecade")}▶
        </span>
      </div>
      <a
        className="iztro-copyright"
        href="https://github.com/sylarlong/iztro"
        target="_blank"
        rel="noreferrer"
      >
        <i>
          Powered by <code>iztro</code>
        </i>
      </a>
    </div>
  );
};
