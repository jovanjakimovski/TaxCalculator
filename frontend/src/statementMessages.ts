const mk: Record<string, string> = {
  "Foreign withholding is shown for review and is not deducted from estimated tax.":
    "Странскиот задржан данок се прикажува за проверка и не е одземен од проценетиот данок.",
  "Forex is excluded from the taxable calculation.":
    "Forex е исклучен од даночната пресметка.",
  "Stock grants and vesting are excluded. Review their tax treatment separately.":
    "Доделените акции и стекнувањето права се исклучени. Проверете го даночниот третман одделно.",
  "Corporate actions are not independently reconstructed. Check their effect on broker cost basis and realized P/L.":
    "Корпоративните настани не се реконструираат одделно. Проверете го ефектот врз основицата и реализираната добивка/загуба од брокерот.",
  "This report supports USD securities, dividends, and interest only. Non-USD income was found.":
    "Извештајот поддржува само USD хартии од вредност, дивиденди и камата. Пронајден е приход во друга валута.",
  "Short positions are not supported by the current Excel report. A closing purchase or opening short sale was found.":
    "Кратките позиции не се поддржани од постојниот Excel. Пронајдено е затворање со купување или отворање кратка продажба.",
  "Unsupported trade columns. Include realized P/L and cost basis in your IBKR Activity Statement.":
    "Неподдржани колони за трансакции. Вклучете реализирана добивка/загуба и основица во IBKR Activity Statement.",
  "A withholding reversal was found. The current Excel report cannot reconcile this adjustment; review it manually.":
    "Пронајдена е корекција на задржан данок. Постојниот Excel не може да ја усогласи; проверете рачно.",
  "No supported realized sales, dividends, or interest were found. No credit will be used.":
    "Нема поддржани реализирани продажби, дивиденди или камата. Нема да се потроши кредит.",
  "The statement exceeds the 10 MB limit.":
    "Изводот го надминува ограничувањето од 10 MB.",
  "The CSV is malformed. Upload the original IBKR Activity Statement CSV.":
    "CSV не е правилно форматиран. Додајте оригинален IBKR Activity Statement CSV.",
  "This statement has too many rows. Export a shorter period (maximum 20,000 rows).":
    "Изводот има премногу редови. Извезете пократок период (најмногу 20.000 редови).",
  "Multiline CSV fields are not supported by this Excel report. Export a standard IBKR Activity Statement.":
    "Полиња со повеќе линии не се поддржани. Извезете стандарден IBKR Activity Statement.",
  "No statement period found. Use an IBKR Activity Statement CSV, not a trade confirmation or an Excel file.":
    "Нема период на извод. Користете IBKR Activity Statement CSV, а не потврда за трансакција или Excel.",
  "Choose a valid statement period of at most one year.":
    "Изберете валиден период до една година.",
  "The statement dates must be between 2000 and today.":
    "Датумите мора да бидат меѓу 2000 година и денес.",
  "Invalid statement date.": "Невалиден датум на извод.",
  "Your session expired. Please sign in again.":
    "Сесијата истече. Најавете се повторно.",
  "Cognito sign-in is not configured.": "Сервисот за најава не е конфигуриран.",
  "Sign-in is not configured.": "Сервисот за најава не е конфигуриран.",
  "Account service is unavailable. Please retry shortly.":
    "Сервисот за сметки моментално не е достапен. Обидете се повторно наскоро.",
  "Your account changed. Sign in to the original account to resume this report.":
    "Сметката е променета. Најавете се со оригиналната сметка за да го продолжите извештајот.",
};
export function statementMessage(message: string, language: "en" | "mk") {
  if (language === "en") return message;
  if (mk[message]) return mk[message];
  const row = message.match(/^Row (\d+): (.+)$/);
  if (row) {
    const details: Record<string, string> = {
      "transaction date is outside the statement period.":
        "датумот на трансакцијата е надвор од периодот.",
      "invalid transaction date.": "невалиден датум на трансакција.",
      "a required trade amount is missing or invalid.":
        "недостасува или е невалиден потребен износ на трансакција.",
      "an income amount is missing or invalid.":
        "недостасува или е невалиден износ на приход.",
    };
    return `Ред ${row[1]}: ${details[row[2]] ?? row[2]}`;
  }
  return message.replace(
    " trades are excluded from this report.",
    " трансакциите се исклучени од извештајот.",
  );
}
