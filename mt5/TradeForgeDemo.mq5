//+------------------------------------------------------------------+
//| Trade Forge - MT5 demo-only moving-average crossover EA          |
//| Demo use only. Trading is disabled by default.                    |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Long-only fast/slow SMA crossover for an MT5 demo account."

#include <Trade/Trade.mqh>

input bool   InpEnableDemoTrading = false; // Must be enabled manually; defaults OFF
input int    InpFastMAPeriod      = 10;
input int    InpSlowMAPeriod      = 30;
input double InpVolumeLots        = 0.01;
input int    InpStopLossPoints    = 300;
input int    InpTakeProfitPoints  = 600;
input int    InpMaxSpreadPoints   = 30;
input ulong  InpMagicNumber       = 26092701;

CTrade trade;
int fastHandle = INVALID_HANDLE;
int slowHandle = INVALID_HANDLE;
datetime lastBarTime = 0;

// This EA intentionally refuses real accounts, even if trading is enabled.
bool IsDemoAccount()
{
   return ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE)
           == ACCOUNT_TRADE_MODE_DEMO);
}

bool TradeCallSucceeded()
{
   uint code = trade.ResultRetcode();
   return (code == TRADE_RETCODE_DONE ||
           code == TRADE_RETCODE_DONE_PARTIAL ||
           code == TRADE_RETCODE_PLACED);
}

bool IsNewBar()
{
   datetime barTime = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(barTime <= 0 || barTime == lastBarTime)
      return false;

   lastBarTime = barTime;
   return true;
}

bool ReadCrossSignals(bool &bullishCross, bool &bearishCross)
{
   bullishCross = false;
   bearishCross = false;

   double fastValues[2];
   double slowValues[2];

   // Request closed bars 1 and 2. CopyBuffer places the older bar first:
   // index 0 = bar 2, index 1 = bar 1.
   if(CopyBuffer(fastHandle, 0, 1, 2, fastValues) != 2 ||
      CopyBuffer(slowHandle, 0, 1, 2, slowValues) != 2)
   {
      Print("Waiting for enough price history to calculate moving averages.");
      return false;
   }

   bullishCross = (fastValues[0] <= slowValues[0] &&
                   fastValues[1] >  slowValues[1]);
   bearishCross = (fastValues[0] >= slowValues[0] &&
                   fastValues[1] <  slowValues[1]);
   return true;
}

bool HasForeignPositionForSymbol()
{
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong candidate = PositionGetTicket(i);
      if(candidate == 0)
         continue;

      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         (ulong)PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
      {
         return true;
      }
   }
   return false;
}

bool FindOwnPosition(ulong &ticket, ENUM_POSITION_TYPE &positionType)
{
   ticket = 0;

   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong candidate = PositionGetTicket(i); // Also selects that position
      if(candidate == 0)
         continue;

      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
      {
         ticket = candidate;
         positionType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         return true;
      }
   }
   return false;
}

bool CloseOwnPosition(const ulong ticket)
{
   ResetLastError();
   bool sent = trade.PositionClose(ticket);
   if(!sent || !TradeCallSucceeded())
   {
      PrintFormat("Close failed. Retcode=%u (%s), error=%d",
                  trade.ResultRetcode(), trade.ResultRetcodeDescription(),
                  GetLastError());
      return false;
   }

   PrintFormat("Demo position close accepted. Deal=%I64u",
               trade.ResultDeal());
   return true;
}

bool OpenDemoBuy()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick) || tick.ask <= 0 || tick.bid <= 0)
   {
      Print("No current bid/ask quote; entry skipped.");
      return false;
   }

   double spreadPoints = (tick.ask - tick.bid) / _Point;
   if(spreadPoints > InpMaxSpreadPoints)
   {
      PrintFormat("Spread %.1f points is above the configured limit (%d); entry skipped.",
                  spreadPoints, InpMaxSpreadPoints);
      return false;
   }

   long minStopPoints = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   long requiredStopPoints = minStopPoints + (long)MathCeil(spreadPoints) + 1;
   if(InpStopLossPoints < requiredStopPoints ||
      InpTakeProfitPoints < requiredStopPoints)
   {
      PrintFormat("Configured stop distances must be at least %d points for this spread and broker.",
                  (int)requiredStopPoints);
      return false;
   }

   double volumeMin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volumeMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double volumeStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(InpVolumeLots < volumeMin || InpVolumeLots > volumeMax ||
      volumeStep <= 0 ||
      MathAbs(InpVolumeLots / volumeStep -
              MathRound(InpVolumeLots / volumeStep)) > 0.0000001)
   {
      PrintFormat("Volume %.4f is outside this symbol's permitted size/step.",
                  InpVolumeLots);
      return false;
   }

   double stopLoss = NormalizeDouble(tick.ask - InpStopLossPoints * _Point, _Digits);
   double takeProfit = NormalizeDouble(tick.ask + InpTakeProfitPoints * _Point, _Digits);

   ResetLastError();
   bool sent = trade.Buy(InpVolumeLots, _Symbol, 0.0, stopLoss, takeProfit,
                         "Trade Forge demo SMA cross");
   if(!sent || !TradeCallSucceeded())
   {
      PrintFormat("Demo buy failed. Retcode=%u (%s), error=%d",
                  trade.ResultRetcode(), trade.ResultRetcodeDescription(),
                  GetLastError());
      return false;
   }

   PrintFormat("Demo buy accepted. Deal=%I64u, order=%I64u, volume=%.2f",
               trade.ResultDeal(), trade.ResultOrder(), InpVolumeLots);
   return true;
}

int OnInit()
{
   if(InpFastMAPeriod < 1 || InpSlowMAPeriod < 2 ||
      InpFastMAPeriod >= InpSlowMAPeriod)
   {
      Print("Invalid settings: fast period must be positive and smaller than slow period.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(InpVolumeLots <= 0 || InpStopLossPoints <= 0 ||
      InpTakeProfitPoints <= 0 || InpMaxSpreadPoints < 0)
   {
      Print("Invalid settings: volume and protective stop/target must be positive.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(!IsDemoAccount())
   {
      Print("Blocked: Trade Forge MT5 EA runs on DEMO accounts only.");
      return INIT_FAILED;
   }

   fastHandle = iMA(_Symbol, PERIOD_CURRENT, InpFastMAPeriod, 0,
                    MODE_SMA, PRICE_CLOSE);
   slowHandle = iMA(_Symbol, PERIOD_CURRENT, InpSlowMAPeriod, 0,
                    MODE_SMA, PRICE_CLOSE);
   if(fastHandle == INVALID_HANDLE || slowHandle == INVALID_HANDLE)
   {
      PrintFormat("Could not create moving-average indicators. Error=%d",
                  GetLastError());
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetAsyncMode(false);
   trade.SetTypeFillingBySymbol(_Symbol);
   lastBarTime = iTime(_Symbol, PERIOD_CURRENT, 0);

   Print("Initialized in DEMO-only mode. Automatic trading is ",
         (InpEnableDemoTrading ? "enabled." : "OFF; set InpEnableDemoTrading=true to enable."));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(fastHandle != INVALID_HANDLE)
      IndicatorRelease(fastHandle);
   if(slowHandle != INVALID_HANDLE)
      IndicatorRelease(slowHandle);
}

void OnTick()
{
   // Re-check the account type on every tick and before any broker action.
   if(!IsDemoAccount())
   {
      Print("Blocked: account is not a DEMO account. No trade action sent.");
      return;
   }

   if(!InpEnableDemoTrading || !IsNewBar())
      return;

   bool bullishCross;
   bool bearishCross;
   if(!ReadCrossSignals(bullishCross, bearishCross))
      return;

   // On netting accounts, separate strategies can share one symbol position.
   // Refuse to act if another strategy/manual trade already has a position here.
   if(HasForeignPositionForSymbol())
   {
      Print("Another position exists for this symbol; this EA will not manage or add to it.");
      return;
   }

   ulong ticket;
   ENUM_POSITION_TYPE positionType;
   bool hasPosition = FindOwnPosition(ticket, positionType);

   // Long-only rule: an opposite crossover exits; a bullish crossover enters.
   if(bearishCross && hasPosition)
   {
      CloseOwnPosition(ticket);
      return;
   }

   if(bullishCross)
   {
      if(hasPosition && positionType == POSITION_TYPE_BUY)
         return; // Never add to an existing position.

      if(hasPosition && !CloseOwnPosition(ticket))
         return;

      // Avoid opening a second position if the first close is still settling.
      if(FindOwnPosition(ticket, positionType))
      {
         Print("Existing strategy position remains open; new entry skipped.");
         return;
      }

      OpenDemoBuy();
   }
}
