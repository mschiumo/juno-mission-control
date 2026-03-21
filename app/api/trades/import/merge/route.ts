/**
 * Trade Merge API
 * 
 * PUT /api/trades/import/merge - Handle merge decisions for duplicate trades
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade } from '@/types/trading';
import { deleteTrade, saveTrade, getTradeById } from '@/lib/db/trades-v2';
import { mergeTrades } from '@/lib/trading/duplicate-detection';
import { requireUserId } from '@/lib/auth-session';

interface MergeRequestBody {
  action: 'merge' | 'keep_both' | 'skip';
  dashboardTradeId: string;
  csvTradeData: Trade;
}

/**
 * PUT /api/trades/import/merge
 * 
 * Handle merge decisions for duplicate trades
 * 
 * Body:
 * - action: 'merge' | 'keep_both' | 'skip'
 * - dashboardTradeId: string
 * - csvTradeData: Trade (the CSV trade data to merge or save)
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const body: MergeRequestBody = await request.json();
    const { action, dashboardTradeId, csvTradeData } = body;

    if (!action || !csvTradeData) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action and csvTradeData' },
        { status: 400 }
      );
    }

    // For merge action, dashboardTradeId is required
    if (action === 'merge' && !dashboardTradeId) {
      return NextResponse.json(
        { success: false, error: 'dashboardTradeId is required for merge action' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'merge': {
        // Get the dashboard trade
        const dashboardTrade = await getTradeById(dashboardTradeId, userId);
        
        if (!dashboardTrade) {
          return NextResponse.json(
            { success: false, error: 'Dashboard trade not found' },
            { status: 404 }
          );
        }

        // Merge trades: delete dashboard trade, save merged CSV trade
        const mergedTrade = mergeTrades(dashboardTrade, csvTradeData);
        
        // Delete the old dashboard trade
        await deleteTrade(dashboardTradeId, userId);

        // Save the merged trade
        await saveTrade(mergedTrade, userId);

        return NextResponse.json({
          success: true,
          data: { 
            mergedTrade, 
            action: 'merge',
            message: 'Trades merged successfully. Dashboard notes preserved.'
          },
        });
      }

      case 'keep_both': {
        // Save the CSV trade as a separate trade
        await saveTrade(csvTradeData, userId);

        return NextResponse.json({
          success: true,
          data: { 
            action: 'keep_both', 
            savedTrade: csvTradeData,
            message: 'CSV trade saved as separate entry'
          },
        });
      }

      case 'skip': {
        // Do nothing, just skip this CSV trade
        return NextResponse.json({
          success: true,
          data: { 
            action: 'skip',
            message: 'CSV trade skipped'
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Invalid action: ${action}. Must be 'merge', 'keep_both', or 'skip'` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error handling merge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process merge request' },
      { status: 500 }
    );
  }
}
