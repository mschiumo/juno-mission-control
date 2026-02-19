import { NextRequest, NextResponse } from 'next/server';
import { parseTOSCSV } from '@/lib/parsers/tos-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!validTypes.includes(file.type) && !['csv', 'xlsx', 'xls'].includes(fileExtension || '')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload CSV or Excel file.' },
        { status: 400 }
      );
    }
    
    // Read file content
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder().decode(bytes);
    
    // Parse based on file type
    let trades;
    if (fileExtension === 'csv' || file.type === 'text/csv') {
      trades = parseTOSCSV(text);
    } else {
      // For now, return error for Excel files - would need xlsx library
      return NextResponse.json(
        { success: false, error: 'Excel support coming soon. Please use CSV format for now.' },
        { status: 400 }
      );
    }
    
    // TODO: Save trades to database
    // For now, just return success with count
    
    return NextResponse.json({
      success: true,
      count: trades.length,
      message: `Successfully parsed ${trades.length} trades`,
      sample: trades.slice(0, 3) // Return first 3 for verification
    });
    
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to import trades' 
      },
      { status: 500 }
    );
  }
}
